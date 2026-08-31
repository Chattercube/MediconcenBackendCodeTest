import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { UserLinksModule } from './user-links/user-links.module';

@Module({
  imports: [DatabaseModule, RedisModule, UserLinksModule],
})
export class AppModule {}
