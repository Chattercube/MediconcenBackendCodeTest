import { Global, Module } from '@nestjs/common';
import { loadConfiguration } from './configuration';

export const APP_CONFIGURATION = Symbol('APP_CONFIGURATION');

@Global()
@Module({
  providers: [
    { provide: APP_CONFIGURATION, useFactory: () => loadConfiguration() },
  ],
  exports: [APP_CONFIGURATION],
})
export class ConfigModule {}
