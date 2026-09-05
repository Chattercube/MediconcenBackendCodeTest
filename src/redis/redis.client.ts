import Redis from 'ioredis';
import { Configuration } from '../config/configuration';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export function createRedisClient(
  configuration: Configuration['redis'],
): Redis {
  return new Redis({
    host: configuration.host,
    port: configuration.port,
    lazyConnect: true,
    connectTimeout: 1000,
    commandTimeout: 1000,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    autoResendUnfulfilledCommands: false,
  });
}
