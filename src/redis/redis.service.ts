import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private available = false;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    this.client.on('error', (error) => {
      this.available = false;
      this.logger.warn(`Redis unavailable: ${error.message}`);
    });

    try {
      await this.client.connect();
      this.available = true;
    } catch (error) {
      this.logger.warn(`Redis connection skipped: ${(error as Error).message}`);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.available || !this.client) {
      return null;
    }

    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.available || !this.client) {
      return;
    }

    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }
}
