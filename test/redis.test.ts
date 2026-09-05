import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { test, TestContext } from 'node:test';
import { Test } from '@nestjs/testing';
import { APP_CONFIGURATION } from '../src/config/config.module';
import { DatabaseService } from '../src/database/database.service';
import { REDIS_CLIENT } from '../src/redis/redis.client';
import { RedisService } from '../src/redis/redis.service';
import { UserLinksService } from '../src/user-links/user-links.service';

class FakeRedis extends EventEmitter {
  status = 'wait';
  failConnect = false;
  failGet = false;
  failSet = false;
  getCalls = 0;
  setCalls = 0;
  values = new Map<string, string>();
  async connect() {
    if (this.failConnect) {
      this.status = 'reconnecting';
      throw new Error('offline');
    }
    this.status = 'ready';
  }
  async get(key: string) {
    this.getCalls++;
    if (this.failGet) throw new Error('read failed');
    return this.values.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.setCalls++;
    if (this.failSet) throw new Error('write failed');
    this.values.set(key, value);
  }
  disconnect() {
    this.status = 'end';
  }
}

async function fixture(context: TestContext) {
  const client = new FakeRedis();
  const records = new Map<string, string>();
  const module = await Test.createTestingModule({
    providers: [
      RedisService,
      UserLinksService,
      { provide: REDIS_CLIENT, useValue: client },
      {
        provide: APP_CONFIGURATION,
        useValue: { redis: { cacheTtlSeconds: 300 } },
      },
      {
        provide: DatabaseService,
        useValue: {
          client: {
            async execute(
              sql: string,
              parameters: { id1: string; id2: string; userId?: string },
            ) {
              const key = JSON.stringify([parameters.id1, parameters.id2]);
              if (sql.includes('INSERT INTO')) {
                if (!records.has(key)) {
                  assert.ok(parameters.userId);
                  records.set(key, parameters.userId);
                }
                return [{}];
              }
              return [[{ user_id: records.get(key) }]];
            },
          },
        },
      },
    ],
  }).compile();
  context.after(() => module.close());
  return {
    client,
    records,
    redis: module.get(RedisService),
    users: module.get(UserLinksService),
  };
}

test('Redis startup failure does not prevent resolution through MySQL', async (context) => {
  const { client, redis, users, records } = await fixture(context);
  client.failConnect = true;
  await redis.onModuleInit();
  const id = await users.resolveUserId('a', 'b');
  assert.equal(id, records.get('["a","b"]'));
  assert.equal(client.getCalls, 0);
  assert.equal(client.setCalls, 0);
});

test('GET failure falls back to the existing MySQL record', async (context) => {
  const { client, redis, users, records } = await fixture(context);
  await redis.onModuleInit();
  const original = await users.resolveUserId('a', 'b');
  client.failGet = true;
  assert.equal(await users.resolveUserId('a', 'b'), original);
  assert.equal(records.size, 1);
});

test('SET failure still returns the newly persisted user ID', async (context) => {
  const { client, redis, users, records } = await fixture(context);
  await redis.onModuleInit();
  client.failSet = true;
  const id = await users.resolveUserId('a', 'b');
  assert.equal(id, records.get('["a","b"]'));
  assert.equal(await users.resolveUserId('a', 'b'), id);
  assert.equal(client.values.size, 0);
});

test('disconnection bypasses cache and readiness restores it', async (context) => {
  const { client, redis } = await fixture(context);
  await redis.onModuleInit();
  client.status = 'reconnecting';
  client.emit('error', new Error('connection lost'));
  assert.equal(await redis.get('key'), null);
  await redis.set('key', 'offline', 300);
  assert.equal(client.getCalls + client.setCalls, 0);
  client.status = 'ready';
  client.emit('ready');
  await redis.set('key', 'recovered', 300);
  assert.equal(await redis.get('key'), 'recovered');
});

test('a command error does not permanently disable an otherwise ready connection', async (context) => {
  const { client, redis } = await fixture(context);
  await redis.onModuleInit();
  client.failGet = true;
  assert.equal(await redis.get('key'), null);
  client.failGet = false;
  await redis.set('key', 'recovered', 300);
  assert.equal(await redis.get('key'), 'recovered');
});

test('shutdown disconnects without waiting for an offline QUIT command', async (context) => {
  const { client, redis } = await fixture(context);
  client.status = 'reconnecting';
  redis.onModuleDestroy();
  assert.equal(client.status, 'end');
});
