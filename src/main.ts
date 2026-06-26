import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { text, urlencoded } from 'express';
import { AppModule } from './app.module';
import { CriticalErrorFilter } from './common/critical-error.filter';
import { CriticalErrorService } from './notifications/critical-error.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const criticalErrors = app.get(CriticalErrorService);
  const port = config.get<number>('PORT', 3000);

  app.use(urlencoded({ extended: true }));
  app.use(text({ type: ['text/*', 'application/octet-stream'] }));
  app.useGlobalFilters(new CriticalErrorFilter(criticalErrors));
  registerProcessErrorHandlers(criticalErrors);
  app.enableShutdownHooks();
  await app.listen(port);
}

function registerProcessErrorHandlers(criticalErrors: CriticalErrorService) {
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));

    void criticalErrors.notify({
      source: 'unhandledRejection',
      message: error.message,
      stack: error.stack,
    });
  });

  process.on('uncaughtException', (error) => {
    void criticalErrors.notify({
      source: 'uncaughtException',
      message: error.message,
      stack: error.stack,
    });
  });
}

void bootstrap();
