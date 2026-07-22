import { Module } from '@nestjs/common';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { InviteLinksService } from './invite-links.service';

@Module({
  providers: [TelegramApiService, InviteLinksService],
  exports: [InviteLinksService],
})
export class InviteLinksModule {}
