import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  ConfigurationError,
  loadConfiguration,
  validateEnvironment,
} from '../src/config/configuration';

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    PORT: '3000',
    MYSQL_HOST: 'localhost',
    MYSQL_PORT: '3306',
    MYSQL_USER: 'app',
    MYSQL_PASSWORD: randomUUID(),
    MYSQL_DATABASE: 'mediconcen',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_CACHE_TTL_SECONDS: '300',
  };
}

test('parses explicit configuration and preserves password characters', () => {
  const env = validEnvironment();
  env.MYSQL_PASSWORD = ` ${randomUUID()}#$ `;
  const result = validateEnvironment(env);
  assert.equal(result.port, 3000);
  assert.equal(result.mysql.port, 3306);
  assert.equal(result.mysql.password, env.MYSQL_PASSWORD);
  assert.equal(result.redis.cacheTtlSeconds, 300);
});

for (const name of Object.keys(validEnvironment())) {
  for (const value of [undefined, '', '   ']) {
    test(`rejects ${name} when ${JSON.stringify(value)} without exposing secrets`, () => {
      const env = validEnvironment();
      const secret = env.MYSQL_PASSWORD!;
      env[name] = value;
      assert.throws(
        () => validateEnvironment(env),
        (error: unknown) => {
          assert.ok(error instanceof ConfigurationError);
          assert.ok(error.message.includes(`${name} is required`));
          assert.ok(error.message.includes('Copy .env.example to .env'));
          assert.ok(!error.message.includes(secret));
          return true;
        },
      );
    });
  }
}

for (const name of [
  'PORT',
  'MYSQL_PORT',
  'REDIS_PORT',
  'REDIS_CACHE_TTL_SECONDS',
]) {
  for (const value of [
    '0',
    '-1',
    '1.5',
    'abc',
    'Infinity',
    '9007199254740992',
  ]) {
    test(`rejects invalid integer ${name}=${value}`, () => {
      assert.throws(
        () => validateEnvironment({ ...validEnvironment(), [name]: value }),
        ConfigurationError,
      );
    });
  }
}

test('rejects ports above 65535', () => {
  for (const name of ['PORT', 'MYSQL_PORT', 'REDIS_PORT']) {
    assert.throws(
      () => validateEnvironment({ ...validEnvironment(), [name]: '65536' }),
      ConfigurationError,
    );
  }
});

test('lists all missing values in one actionable error', () => {
  assert.throws(
    () => validateEnvironment({}),
    (error: unknown) => {
      assert.ok(error instanceof ConfigurationError);
      for (const name of Object.keys(validEnvironment()))
        assert.ok(error.message.includes(name));
      assert.ok(error.message.includes('README.md'));
      return true;
    },
  );
});

test('loads .env while preserving already supplied environment variables', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'mediconcen-config-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, '.env');
  const values = validEnvironment();
  writeFileSync(
    path,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const env = { PORT: '4000' };
  const result = loadConfiguration(path, env);
  assert.equal(result.port, 4000);
  assert.equal(result.mysql.password, values.MYSQL_PASSWORD);
});

test('accepts externally supplied configuration without a .env file', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'mediconcen-config-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  assert.equal(
    loadConfiguration(join(directory, '.env'), validEnvironment()).mysql.host,
    'localhost',
  );
});

test('startup with no configuration exits with setup guidance before connecting', (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'mediconcen-startup-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const name of Object.keys(validEnvironment())) delete env[name];
  const result = spawnSync(
    process.execPath,
    [resolve(__dirname, '../src/main.js')],
    {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('Copy .env.example to .env'));
  assert.ok(result.stderr.includes('MYSQL_PASSWORD is required'));
  assert.ok(!`${result.stdout}${result.stderr}`.includes('ECONNREFUSED'));
});
