import { config } from 'dotenv';

export class ConfigurationError extends Error {}

export interface Configuration {
  port: number;
  mysql: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  redis: { host: string; port: number; cacheTtlSeconds: number };
}

export function validateEnvironment(env: NodeJS.ProcessEnv): Configuration {
  const issues: string[] = [];
  function required(name: string): string {
    const value = env[name];
    if (!value?.trim()) {
      issues.push(`${name} is required`);
    }
    return value ?? '';
  }
  function positiveInteger(
    name: string,
    max = Number.MAX_SAFE_INTEGER,
  ): number {
    const value = required(name);
    const number = Number(value);
    if (
      value.trim() &&
      (!/^\d+$/.test(value) ||
        !Number.isSafeInteger(number) ||
        number < 1 ||
        number > max)
    ) {
      issues.push(`${name} must be an integer between 1 and ${max}`);
    }
    return number;
  }

  const result: Configuration = {
    port: positiveInteger('PORT', 65535),
    mysql: {
      host: required('MYSQL_HOST'),
      port: positiveInteger('MYSQL_PORT', 65535),
      user: required('MYSQL_USER'),
      password: required('MYSQL_PASSWORD'),
      database: required('MYSQL_DATABASE'),
    },
    redis: {
      host: required('REDIS_HOST'),
      port: positiveInteger('REDIS_PORT', 65535),
      cacheTtlSeconds: positiveInteger('REDIS_CACHE_TTL_SECONDS'),
    },
  };

  if (issues.length) {
    throw new ConfigurationError(
      `Invalid configuration:\n- ${issues.join('\n- ')}\n` +
        'Copy .env.example to .env in the project root and fill in the required values, ' +
        'including your own MYSQL_PASSWORD, then restart. ' +
        'Alternatively, supply these environment variables directly. See README.md for setup instructions.',
    );
  }
  return result;
}

export function loadConfiguration(
  path = '.env',
  env: NodeJS.ProcessEnv = process.env,
): Configuration {
  const result = config({
    path,
    processEnv: env,
    override: false,
    quiet: true,
  });
  if (
    result.error &&
    (result.error as NodeJS.ErrnoException).code !== 'ENOENT'
  ) {
    throw new ConfigurationError(
      'Cannot read .env. Check its file permissions and restart. See README.md for setup instructions.',
    );
  }
  return validateEnvironment(env);
}
