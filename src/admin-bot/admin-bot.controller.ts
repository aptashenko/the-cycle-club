import { Body, Controller, Post } from '@nestjs/common';
import { TelegramUpdate } from '../bot/telegram.types';
import { AdminBotService } from './admin-bot.service';

@Controller('admin-bot/telegram')
export class AdminBotController {
  constructor(private readonly adminBot: AdminBotService) {}

  @Post('webhook')
  async handleWebhook(@Body() update: TelegramUpdate) {
    await this.adminBot.handleUpdate(update);
    return { ok: true };
  }
}
