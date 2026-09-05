import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { APP_CONFIGURATION } from '../src/config/config.module';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/redis/redis.service';
import { UserLinksService } from '../src/user-links/user-links.service';

const scenarios: { name: string; pairs: [string, string][] }[] = [
  {
    name: 'colon-delimited identifiers',
    pairs: [
      ['a:b', 'c'],
      ['a', 'b:c'],
    ],
  },
  {
    name: 'quotes, backslashes and pair ordering',
    pairs: [
      ['a","b', 'c\\d'],
      ['a', 'b","c\\d'],
      ['c\\d', 'a","b'],
    ],
  },
];

for (const { name, pairs } of scenarios) {
  test(`resolves and caches distinct pairs independently: ${name}`, async (context) => {
    const rows: { id1: string; id2: string; userId: string }[] = [];
    const cache = new Map<string, string>();
    let databaseCalls = 0;
    const module = await Test.createTestingModule({
      providers: [
        UserLinksService,
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
                databaseCalls++;
                const existing = rows.find(
                  (row) =>
                    row.id1 === parameters.id1 && row.id2 === parameters.id2,
                );
                if (sql.includes('INSERT INTO')) {
                  if (!existing) {
                    assert.ok(parameters.userId);
                    rows.push({
                      id1: parameters.id1,
                      id2: parameters.id2,
                      userId: parameters.userId,
                    });
                  }
                  return [{}];
                }
                assert.ok(sql.includes('SELECT user_id'));
                return [existing ? [{ user_id: existing.userId }] : []];
              },
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            async get(key: string) {
              return cache.get(key) ?? null;
            },
            async set(key: string, value: string) {
              cache.set(key, value);
            },
          },
        },
      ],
    }).compile();
    context.after(() => module.close());
    const service = module.get(UserLinksService);

    const ids: string[] = [];
    for (const pair of pairs) ids.push(await service.resolveUserId(...pair));
    assert.equal(
      new Set(ids).size,
      pairs.length,
      'each pair must have its own user ID',
    );
    assert.equal(
      rows.length,
      pairs.length,
      'every pair must reach the database',
    );
    assert.equal(
      cache.size,
      pairs.length,
      'every pair must have its own cache entry',
    );

    const callsBeforeCacheHits = databaseCalls;
    for (const [index, pair] of pairs.entries()) {
      assert.equal(await service.resolveUserId(...pair), ids[index]);
    }
    assert.equal(
      databaseCalls,
      callsBeforeCacheHits,
      'repeated requests should use the cache',
    );

    cache.clear();
    for (const [index, pair] of pairs.entries()) {
      assert.equal(
        await service.resolveUserId(...pair),
        ids[index],
        'cache misses must return the same persisted ID',
      );
    }
    assert.equal(rows.length, pairs.length);
  });
}
