import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramUpdate } from '../bot/telegram.types';

type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

@Injectable()
export class MigrationTelegramApiService {
  private readonly logger = new Logger(MigrationTelegramApiService.name);
  private readonly token?: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('MIGRATION_BOT_TOKEN');
  }

  async sendMessage(chatId: string | number, text: string) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    });
  }

  async deleteWebhook(dropPendingUpdates = false) {
    return this.request('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    const data = await this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message'],
    });

    return data.result ?? [];
  }

  private async request<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramResponse<T>> {
    if (!this.token) {
      this.logger.warn('Migration Telegram bot token is not configured');
      return {
        ok: false,
        description: 'Migration Telegram bot token is not configured',
      };
    }

    const response = await fetch(
      `https://api.telegram.org/bot${this.token}/${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    const data = (await response.json()) as TelegramResponse<T>;

    if (!response.ok || !data.ok) {
      this.logger.error(
        `Migration Telegram ${method} failed: ${response.status} ${data.description ?? ''}`,
      );
    }

    return data;
  }
}
