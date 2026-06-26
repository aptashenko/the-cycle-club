import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TelegramMarkup = Record<string, unknown>;
type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

@Injectable()
export class AdminTelegramApiService {
  private readonly logger = new Logger(AdminTelegramApiService.name);
  private readonly token?: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.get<string>('ADMIN_TELEGRAM_BOT_TOKEN');
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    replyMarkup?: TelegramMarkup,
  ) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
  }

  private async request<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramResponse<T>> {
    if (!this.token) {
      this.logger.warn('Admin Telegram bot token is not configured');
      return {
        ok: false,
        description: 'Admin Telegram bot token is not configured',
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
        `Admin Telegram ${method} failed: ${response.status} ${data.description ?? ''}`,
      );
    }

    return data;
  }
}
