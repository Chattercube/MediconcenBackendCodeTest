import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { APP_CONFIGURATION } from '../config/config.module';
import { Configuration } from '../config/configuration';
import { createRedisClient, REDIS_CLIENT } from './redis.client';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIGURATION],
      useFactory: (configuration: Configuration) =>
        createRedisClient(configuration.redis),
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
