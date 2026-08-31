import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

interface UserLinkRow extends RowDataPacket {
  user_id: string;
}

@Injectable()
export class UserLinksService {
  private readonly cacheTtlSeconds = Number(process.env.REDIS_CACHE_TTL_SECONDS ?? 300);

  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  async resolveUserId(id1: string, id2: string): Promise<string> {
    const cacheKey = this.cacheKey(id1, id2);
    const cachedUserId = await this.redis.get(cacheKey);

    if (cachedUserId) {
      return cachedUserId;
    }

    const generatedUserId = randomUUID();

    await this.database.client.execute<ResultSetHeader>(
      `
      INSERT INTO user_links (id1, id2, user_id)
      VALUES (:id1, :id2, :userId)
      ON DUPLICATE KEY UPDATE user_id = user_id
      `,
      { id1, id2, userId: generatedUserId },
    );

    const [rows] = await this.database.client.execute<UserLinkRow[]>(
      `
      SELECT user_id
      FROM user_links
      WHERE id1 = :id1 AND id2 = :id2
      LIMIT 1
      `,
      { id1, id2 },
    );

    const userId = rows[0].user_id;
    await this.redis.set(cacheKey, userId, this.cacheTtlSeconds);
    return userId;
  }

  private cacheKey(id1: string, id2: string): string {
    return `user-link:${id1}:${id2}`;
  }
}
