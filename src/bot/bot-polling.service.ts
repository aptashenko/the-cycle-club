import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { BotService } from './bot.service';

@Injectable()
export class BotPollingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BotPollingService.name);
  private isRunning = false;
  private offset: number | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramApiService,
    private readonly bot: BotService,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.get<string>('TELEGRAM_BOT_MODE', 'webhook') !== 'polling') {
      return;
    }

    this.isRunning = true;
    await this.telegram.deleteWebhook(false);
    this.logger.log('Telegram polling started');
    void this.poll();
  }

  onApplicationShutdown() {
    this.isRunning = false;
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const updates = await this.telegram.getUpdates(this.offset);

        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.bot.handleUpdate(update);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Telegram polling failed: ${message}`);
        await this.sleep(3000);
      }
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
