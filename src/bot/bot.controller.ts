import { Body, Controller, Post } from '@nestjs/common';
import { BotService } from './bot.service';
import { TelegramUpdate } from './telegram.types';

@Controller('bot/telegram')
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Post('webhook')
  async handleWebhook(@Body() update: TelegramUpdate) {
    await this.bot.handleUpdate(update);
    return { ok: true };
  }
}
