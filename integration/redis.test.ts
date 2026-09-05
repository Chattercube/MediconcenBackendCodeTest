import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { createConnection, createServer, Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import Redis from 'ioredis';
import { config as dotenv } from 'dotenv';
import { createRedisClient } from '../src/redis/redis.client';
import { RedisService } from '../src/redis/redis.service';

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  message: string,
) {
  const deadline = Date.now() + 5000;
  while (!(await condition())) {
    assert.ok(Date.now() < deadline, message);
    await delay(25);
  }
}

test(
  'live Redis: TTL, disconnect fallback, command timeout and reconnection',
  { timeout: 25000 },
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
    const host =
      process.env.REDIS_TEST_HOST ?? process.env.REDIS_HOST ?? '127.0.0.1';
    const port = Number(
      process.env.REDIS_TEST_PORT ?? process.env.REDIS_PORT ?? 6379,
    );
    const inspector = new Redis({
      host,
      port,
      lazyConnect: true,
      retryStrategy: null,
      connectTimeout: 1000,
      commandTimeout: 1000,
    });
    inspector.on('error', () => {});
    const keys = ['value', 'expiry', 'offline', 'recovered'].map(
      (suffix) => `codex:redis-test:${randomUUID()}:${suffix}`,
    );
    const sockets = new Set<Socket>();
    const clients: RedisService[] = [];
    let online = true;
    let stalled = false;
    const proxy = createServer((socket) => {
      if (!online) {
        socket.destroy();
        return;
      }
      const upstream = createConnection({ host, port });
      for (const connection of [socket, upstream]) {
        sockets.add(connection);
        connection.on('error', () => {});
        connection.on('close', () => {
          sockets.delete(connection);
          socket.destroy();
          upstream.destroy();
        });
      }
      socket.on('data', (data) => {
        if (!stalled) upstream.write(data);
      });
      upstream.on('data', (data) => {
        if (!stalled) socket.write(data);
      });
    });
    context.after(async () => {
      for (const service of clients) service.onModuleDestroy();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
      try {
        if (inspector.status === 'ready') await inspector.del(...keys);
      } finally {
        inspector.disconnect();
      }
    });

    await inspector.connect();
    assert.equal(await inspector.ping(), 'PONG');
    const info = await inspector.info('server');
    context.diagnostic(
      `Connected to Redis ${/redis_version:(\S+)/.exec(info)?.[1]} at ${host}:${port}`,
    );
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', () => {
        proxy.off('error', reject);
        resolve();
      });
    });
    const address = proxy.address();
    assert.ok(address && typeof address !== 'string');
    const configuration = {
      host: '127.0.0.1',
      port: address.port,
      cacheTtlSeconds: 300,
    };
    const client = createRedisClient(configuration);
    const service = new RedisService(client);
    clients.push(service);
    await service.onModuleInit();
    assert.equal(client.status, 'ready');

    await service.set(keys[0], 'persisted-id', 60);
    assert.equal(await service.get(keys[0]), 'persisted-id');
    assert.ok((await inspector.ttl(keys[0])) > 0);
    await service.set(keys[1], 'expires', 1);
    const expiry = await inspector.pttl(keys[1]);
    assert.ok(expiry > 0 && expiry <= 1000);
    await waitFor(
      async () => (await inspector.exists(keys[1])) === 0,
      'Redis should expire the test key within the bounded wait',
    );
    assert.equal(await service.get(keys[1]), null);
    context.diagnostic('SET/GET and server-side TTL expiration passed.');

    stalled = true;
    let started = Date.now();
    assert.equal(await service.get(keys[0]), null);
    assert.ok(
      Date.now() - started < 3000,
      'stalled GET must have a bounded wait',
    );
    started = Date.now();
    await service.set(keys[3], 'timed-out', 60);
    assert.ok(
      Date.now() - started < 3000,
      'stalled SET must have a bounded wait',
    );
    context.diagnostic(
      'Stalled GET and SET returned safely after the command timeout.',
    );

    online = false;
    stalled = false;
    for (const socket of sockets) socket.destroy();
    await waitFor(
      () => client.status !== 'ready',
      'client should detect connection loss',
    );
    assert.equal(await service.get(keys[0]), null);
    await service.set(keys[2], 'must-not-be-queued', 60);

    const lateClient = createRedisClient(configuration);
    const lateService = new RedisService(lateClient);
    clients.push(lateService);
    await lateService.onModuleInit();
    assert.notEqual(lateClient.status, 'ready');
    assert.equal(await lateService.get(keys[0]), null);
    context.diagnostic(
      'Disconnected operations and startup while offline did not throw.',
    );

    online = true;
    await waitFor(
      () => client.status === 'ready' && lateClient.status === 'ready',
      'clients should recover automatically',
    );
    assert.equal(await service.get(keys[0]), 'persisted-id');
    assert.equal(await lateService.get(keys[0]), 'persisted-id');
    await service.set(keys[3], 'recovered-id', 60);
    assert.equal(await inspector.get(keys[3]), 'recovered-id');
    assert.equal(
      await inspector.get(keys[2]),
      null,
      'offline writes must not be replayed',
    );
    context.diagnostic(
      'Both clients recovered; cache reads/writes resumed and offline writes were not replayed.',
    );
  },
);
