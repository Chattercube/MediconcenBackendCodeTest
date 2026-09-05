import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';
import { APP_CONFIGURATION } from '../config/config.module';
import { Configuration } from '../config/configuration';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  constructor(
    @Inject(APP_CONFIGURATION) private readonly configuration: Configuration,
  ) {}

  async onModuleInit() {
    this.pool = createPool({
      ...this.configuration.mysql,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
    });

    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS user_links (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        id1 VARCHAR(255) NOT NULL,
        id2 VARCHAR(255) NOT NULL,
        user_id CHAR(36) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_user_links_id1_id2 (id1, id2),
        UNIQUE KEY uq_user_links_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  get client(): Pool {
    return this.pool;
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
