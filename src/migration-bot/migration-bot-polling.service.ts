import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MigrationBotService } from './migration-bot.service';
import { MigrationTelegramApiService } from './migration-telegram-api.service';

@Injectable()
export class MigrationBotPollingService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MigrationBotPollingService.name);
  private isRunning = false;
  private offset: number | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: MigrationTelegramApiService,
    private readonly bot: MigrationBotService,
  ) {}

  async onApplicationBootstrap() {
    if (
      this.config.get<string>('MIGRATION_BOT_MODE', 'webhook') !== 'polling'
    ) {
      return;
    }

    this.isRunning = true;
    await this.telegram.deleteWebhook(false);
    this.logger.log('Migration Telegram polling started');
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
        this.logger.error(`Migration Telegram polling failed: ${message}`);
        await this.sleep(3000);
      }
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
