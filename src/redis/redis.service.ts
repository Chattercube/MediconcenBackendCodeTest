import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIGURATION } from '../config/config.module';
import { Configuration } from '../config/configuration';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;
  private available = false;

  constructor(
    @Inject(APP_CONFIGURATION) private readonly configuration: Configuration,
  ) {}

  async onModuleInit() {
    this.client = new Redis({
      host: this.configuration.redis.host,
      port: this.configuration.redis.port,
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
