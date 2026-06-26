import { Module } from '@nestjs/common';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { TelegramApiService } from './telegram-api.service';
import { NotificationService } from './notification.service';

@Module({
  providers: [TelegramApiService, AdminTelegramApiService, NotificationService],
  exports: [TelegramApiService, NotificationService],
})
export class NotificationsModule {}
