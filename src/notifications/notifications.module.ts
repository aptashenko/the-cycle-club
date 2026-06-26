import { Module } from '@nestjs/common';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { CriticalErrorService } from './critical-error.service';
import { TelegramApiService } from './telegram-api.service';
import { NotificationService } from './notification.service';

@Module({
  providers: [
    TelegramApiService,
    AdminTelegramApiService,
    NotificationService,
    CriticalErrorService,
  ],
  exports: [TelegramApiService, NotificationService, CriticalErrorService],
})
export class NotificationsModule {}
