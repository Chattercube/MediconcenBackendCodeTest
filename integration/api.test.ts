import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { config as dotenv } from 'dotenv';
import { createConnection, RowDataPacket } from 'mysql2/promise';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { APP_CONFIGURATION } from '../src/config/config.module';
import { Configuration } from '../src/config/configuration';
import { REDIS_CLIENT } from '../src/redis/redis.client';
import { createValidationPipe } from '../src/validation';
import { TcpProxy } from './helpers/tcp-proxy';

function required(name: string): string {
  const value = process.env[name];
  assert.ok(
    value?.trim(),
    `Set ${name} in .env or the shell before npm run test:integration. See README.md.`,
  );
  return value!;
}

async function waitFor(condition: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    assert.ok(
      Date.now() < deadline,
      'Timed out waiting for the test connection state',
    );
    await delay(25);
  }
}

test(
  'HTTP API with live MySQL and Redis',
  { timeout: 60000 },
  async (context) => {
    const loaded = dotenv({
      path: process.env.INTEGRATION_ENV_FILE ?? '.env',
      quiet: true,
    });
    if (
      loaded.error &&
      (loaded.error as NodeJS.ErrnoException).code !== 'ENOENT'
    ) {
      throw new Error(
        'Cannot read integration configuration; check INTEGRATION_ENV_FILE and file permissions.',
      );
    }
    const mysql = {
      host: required('MYSQL_HOST'),
      port: Number(required('MYSQL_PORT')),
      user: required('MYSQL_USER'),
      password: required('MYSQL_PASSWORD'),
      database: required('MYSQL_DATABASE'),
    };
    const redisTarget = {
      host:
        process.env.REDIS_TEST_HOST ?? process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(
        process.env.REDIS_TEST_PORT ?? process.env.REDIS_PORT ?? 6379,
      ),
    };
    const database = await createConnection({ ...mysql, connectTimeout: 2000 });
    const redis = new Redis({
      ...redisTarget,
      lazyConnect: true,
      retryStrategy: null,
      connectTimeout: 1000,
      commandTimeout: 1000,
    });
    redis.on('error', () => {});
    const mysqlProxy = new TcpProxy(mysql.host, mysql.port);
    const redisProxy = new TcpProxy(redisTarget.host, redisTarget.port);
    const ownedPairs: [string, string][] = [];
    let app: INestApplication | undefined;
    context.after(async () => {
      try {
        await app?.close();
        // Only delete rows and keys for exact, random identifier pairs created by this run.
        for (const pair of ownedPairs) {
          await database.execute(
            'DELETE FROM user_links WHERE id1 = ? AND id2 = ?',
            pair,
          );
        }
        if (redis.status === 'ready' && ownedPairs.length) {
          await redis.del(
            ...ownedPairs.map((pair) => `user-link:${JSON.stringify(pair)}`),
          );
        }
      } finally {
        redis.disconnect();
        await Promise.all([
          database.end(),
          mysqlProxy.close(),
          redisProxy.close(),
        ]);
      }
    });
    await redis.connect();
    assert.equal(await redis.ping(), 'PONG');
    const [version] = await database.query<RowDataPacket[]>(
      'SELECT VERSION() AS version',
    );
    assert.match(
      String(version[0].version),
      /^8\./,
      'This suite requires MySQL 8',
    );
    const redisInfo = await redis.info('server');
    context.diagnostic(
      `MySQL ${version[0].version}; Redis ${/redis_version:(\S+)/.exec(redisInfo)?.[1]}`,
    );
    const configuration: Configuration = {
      port: 3000,
      mysql: { ...mysql, host: '127.0.0.1', port: await mysqlProxy.start() },
      redis: {
        host: '127.0.0.1',
        port: await redisProxy.start(),
        cacheTtlSeconds: 60,
      },
    };
    async function startApp() {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_CONFIGURATION)
        .useValue(configuration)
        .compile();
      app = module.createNestApplication({ logger: false });
      app.useGlobalPipes(createValidationPipe());
      await app.listen(0, '127.0.0.1');
      assert.equal(app.get<Redis>(REDIS_CLIENT).status, 'ready');
    }
    await startApp();

    function pair(label: string): [string, string] {
      const value: [string, string] = [
        `integration:${randomUUID()}:${label}`,
        randomUUID(),
      ];
      ownedPairs.push(value);
      return value;
    }
    async function post(body: unknown) {
      assert.ok(app);
      const response = await fetch(`${await app.getUrl()}/users/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    }
    async function resolvePair(value: [string, string]): Promise<string> {
      const response = await post({ id1: value[0], id2: value[1] });
      assert.equal(response.status, 200);
      assert.equal(typeof response.body.userID, 'string');
      const id = response.body.userID as string;
      assert.match(
        id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      return id;
    }
    async function persisted(value: [string, string]) {
      const [rows] = await database.execute<RowDataPacket[]>(
        'SELECT user_id FROM user_links WHERE id1 = ? AND id2 = ?',
        value,
      );
      assert.equal(rows.length, 1);
      return rows[0].user_id;
    }
    const key = (value: [string, string]) =>
      `user-link:${JSON.stringify(value)}`;

    await context.test(
      'new and repeated requests persist one UUID and populate Redis',
      async () => {
        const value = pair('new');
        const id = await resolvePair(value);
        assert.equal(await persisted(value), id);
        assert.equal(await redis.get(key(value)), id);
        const ttl = await redis.ttl(key(value));
        assert.ok(ttl > 0 && ttl <= 60);
        assert.equal(await resolvePair(value), id);
        await redis.del(key(value));
        assert.equal(await resolvePair(value), id);
        assert.equal(await persisted(value), id);
      },
    );

    await context.test(
      'the UUID survives application restart and cache removal',
      async () => {
        const value = pair('restart');
        const id = await resolvePair(value);
        await app!.close();
        app = undefined;
        await redis.del(key(value));
        await startApp();
        assert.equal(await resolvePair(value), id);
        assert.equal(await persisted(value), id);
      },
    );

    await context.test(
      'formerly colliding pairs receive separate persisted UUIDs',
      async () => {
        const prefix = `integration:${randomUUID()}`;
        const first: [string, string] = [`${prefix}:a:b`, 'c'];
        const second: [string, string] = [`${prefix}:a`, 'b:c'];
        ownedPairs.push(first, second);
        const firstId = await resolvePair(first);
        const secondId = await resolvePair(second);
        assert.notEqual(firstId, secondId);
        assert.equal(await persisted(first), firstId);
        assert.equal(await persisted(second), secondId);
        assert.equal(await redis.get(key(first)), firstId);
        assert.equal(await redis.get(key(second)), secondId);
      },
    );

    await context.test(
      'identifier equality follows the documented MySQL collation',
      async () => {
        const suffix = randomUUID();
        const variants: [string, string][] = [
          [`Café:${suffix}`, 'Member'],
          [`cafe:${suffix}`, 'member'],
          [`CAFÉ:${suffix}   `, 'MEMBER   '],
        ];
        ownedPairs.push(...variants);
        const ids: string[] = [];
        for (const value of variants) ids.push(await resolvePair(value));
        assert.equal(
          new Set(ids).size,
          1,
          'case, accents and trailing spaces should identify the same row',
        );
        const [rows] = await database.execute<RowDataPacket[]>(
          'SELECT COUNT(*) AS record_count FROM user_links WHERE id1 = ? AND id2 = ?',
          variants[0],
        );
        assert.equal(Number(rows[0].record_count), 1);
      },
    );

    await context.test(
      '24 concurrent requests create one record and return one UUID',
      async () => {
        const value = pair('concurrent');
        const ids = await Promise.all(
          Array.from({ length: 24 }, () => resolvePair(value)),
        );
        assert.equal(new Set(ids).size, 1);
        assert.equal(await persisted(value), ids[0]);
      },
    );

    await context.test(
      'invalid HTTP bodies return understandable 400 errors',
      async () => {
        for (const body of [
          {},
          { id1: 'a' },
          { id1: 123, id2: 'b' },
          { id1: '', id2: 'b' },
          { id1: 'a', id2: 'b', extra: true },
        ]) {
          const response = await post(body);
          assert.equal(response.status, 400);
          assert.ok(Array.isArray(response.body.message));
          assert.ok(response.body.message.length > 0);
        }
      },
    );

    await context.test(
      'Redis outage preserves existing and new IDs; caching recovers',
      async () => {
        const existing = pair('redis-existing');
        const id = await resolvePair(existing);
        redisProxy.setOnline(false);
        try {
          await waitFor(() => app!.get<Redis>(REDIS_CLIENT).status !== 'ready');
          assert.equal(await resolvePair(existing), id);
          const fresh = pair('redis-offline');
          const freshId = await resolvePair(fresh);
          assert.equal(await persisted(fresh), freshId);
          assert.equal(await redis.get(key(fresh)), null);
          redisProxy.setOnline(true);
          await waitFor(() => app!.get<Redis>(REDIS_CLIENT).status === 'ready');
          assert.equal(await resolvePair(fresh), freshId);
          assert.equal(await redis.get(key(fresh)), freshId);
        } finally {
          redisProxy.setOnline(true);
        }
      },
    );

    await context.test(
      'MySQL outage yields a generic 500 and the API recovers',
      async () => {
        const value = pair('mysql-offline');
        mysqlProxy.setOnline(false);
        try {
          const response = await post({ id1: value[0], id2: value[1] });
          assert.equal(response.status, 500);
          assert.deepEqual(response.body, {
            statusCode: 500,
            message: 'Internal server error',
          });
          assert.equal(
            (await post({})).status,
            400,
            'the API process should remain responsive',
          );
        } finally {
          mysqlProxy.setOnline(true);
        }
        const id = await resolvePair(value);
        assert.equal(await persisted(value), id);
      },
    );
  },
);
