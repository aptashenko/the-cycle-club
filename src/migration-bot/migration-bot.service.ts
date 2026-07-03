import { Injectable } from '@nestjs/common';
import { TelegramUpdate } from '../bot/telegram.types';
import { MIGRATION_BOT_MESSAGE } from './migration-bot.constants';
import { MigrationTelegramApiService } from './migration-telegram-api.service';

@Injectable()
export class MigrationBotService {
  constructor(private readonly telegram: MigrationTelegramApiService) {}

  async handleUpdate(update: TelegramUpdate) {
    if (!update.message) {
      return;
    }

    await this.telegram.sendMessage(
      update.message.chat.id,
      MIGRATION_BOT_MESSAGE,
    );
  }
}
