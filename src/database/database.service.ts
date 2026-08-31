import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit() {
    this.pool = createPool({
      host: process.env.MYSQL_HOST ?? 'localhost',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER ?? 'app',
      password: process.env.MYSQL_PASSWORD ?? 'app_password',
      database: process.env.MYSQL_DATABASE ?? 'mediconcen',
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
