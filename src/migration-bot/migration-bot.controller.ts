import { Body, Controller, Post } from '@nestjs/common';
import { TelegramUpdate } from '../bot/telegram.types';
import { MigrationBotService } from './migration-bot.service';

@Controller('migration-bot/telegram')
export class MigrationBotController {
  constructor(private readonly migrationBot: MigrationBotService) {}

  @Post('webhook')
  async handleWebhook(@Body() update: TelegramUpdate) {
    await this.migrationBot.handleUpdate(update);
    return { ok: true };
  }
}
