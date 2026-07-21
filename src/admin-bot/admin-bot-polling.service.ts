import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminBotService } from './admin-bot.service';
import { AdminTelegramApiService } from './admin-telegram-api.service';

@Injectable()
export class AdminBotPollingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AdminBotPollingService.name);
  private isRunning = false;
  private offset: number | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: AdminTelegramApiService,
    private readonly bot: AdminBotService,
  ) {}

  async onApplicationBootstrap() {
    if (
      this.config.get<string>('ADMIN_TELEGRAM_BOT_MODE', 'webhook') !==
      'polling'
    ) {
      return;
    }

    this.isRunning = true;
    await this.telegram.deleteWebhook(false);
    this.logger.log('Admin Telegram polling started');
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
        this.logger.error(`Admin Telegram polling failed: ${message}`);
        await this.sleep(3000);
      }
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
