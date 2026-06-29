import { Module } from '@nestjs/common';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { BotFlowService } from '../bot/bot-flow.service';
import { CriticalErrorService } from './critical-error.service';
import { TelegramApiService } from './telegram-api.service';
import { NotificationService } from './notification.service';

@Module({
  providers: [
    TelegramApiService,
    AdminTelegramApiService,
    BotFlowService,
    NotificationService,
    CriticalErrorService,
  ],
  exports: [TelegramApiService, NotificationService, CriticalErrorService],
})
export class NotificationsModule {}
