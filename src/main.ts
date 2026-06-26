import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { text, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  app.use(urlencoded({ extended: true }));
  app.use(text({ type: ['text/*', 'application/octet-stream'] }));
  app.enableShutdownHooks();
  await app.listen(port);
}

void bootstrap();
