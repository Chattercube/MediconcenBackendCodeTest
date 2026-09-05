import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createValidationPipe } from './validation';
import { APP_CONFIGURATION } from './config/config.module';
import { Configuration, ConfigurationError } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.useGlobalPipes(createValidationPipe());

  const configuration = app.get<Configuration>(APP_CONFIGURATION);
  try {
    await app.listen(configuration.port);
  } catch (error) {
    await app.close();
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : 'Application startup failed. Check database availability and server logs.',
  );
  process.exitCode = 1;
});
