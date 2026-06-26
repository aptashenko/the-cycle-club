import { Module } from '@nestjs/common';
import { TelegramApiService } from './telegram-api.service';
import { NotificationService } from './notification.service';

@Module({
  providers: [TelegramApiService, NotificationService],
  exports: [TelegramApiService, NotificationService],
})
export class NotificationsModule {}
