import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.client';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit() {
    this.client.on('error', () => {
      this.logger.warn(
        'Redis connection error; requests will use MySQL when the cache is unavailable.',
      );
    });

    try {
      await this.client.connect();
    } catch {
      this.logger.warn(
        'Redis startup connection failed; continuing with MySQL.',
      );
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.client.status !== 'ready') {
      return null;
    }

    try {
      return await this.client.get(key);
    } catch {
      this.logger.warn('Redis GET failed; treating it as a cache miss.');
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.client.status !== 'ready') {
      return;
    }

    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch {
      this.logger.warn('Redis SET failed; the MySQL result remains valid.');
    }
  }

  onModuleDestroy() {
    // Stop reconnecting even when Redis is offline; there is no queued cache work to flush.
    this.client.disconnect();
  }
}
