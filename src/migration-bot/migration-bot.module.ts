import { Module } from '@nestjs/common';
import { MigrationBotController } from './migration-bot.controller';
import { MigrationBotPollingService } from './migration-bot-polling.service';
import { MigrationBotService } from './migration-bot.service';
import { MigrationTelegramApiService } from './migration-telegram-api.service';

@Module({
  controllers: [MigrationBotController],
  providers: [
    MigrationBotService,
    MigrationBotPollingService,
    MigrationTelegramApiService,
  ],
})
export class MigrationBotModule {}
