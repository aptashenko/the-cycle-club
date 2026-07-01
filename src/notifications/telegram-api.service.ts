import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { extname } from 'path';
import { TelegramUpdate } from '../bot/telegram.types';

type TelegramMarkup = Record<string, unknown>;
type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);
  private readonly token: string;

  constructor(private readonly config: ConfigService) {
    this.token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
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

  async sendPhotoFile(
    chatId: string | number,
    photoPath: string,
    filename: string,
    replyMarkup?: TelegramMarkup,
  ) {
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set(
      'photo',
      new Blob([readFileSync(photoPath)], {
        type: this.getPhotoContentType(filename),
      }),
      filename,
    );

    if (replyMarkup) {
      form.set('reply_markup', JSON.stringify(replyMarkup));
    }

    return this.requestForm('sendPhoto', form);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.request('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  async deleteWebhook(dropPendingUpdates = false) {
    return this.request('deleteWebhook', {
      drop_pending_updates: dropPendingUpdates,
    });
  }

  async removeChatMember(chatId: string | number, userId: string | number) {
    const banResponse = await this.request('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      revoke_messages: false,
    });

    if (!banResponse.ok) {
      return banResponse;
    }

    await this.request('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: true,
    });

    return banResponse;
  }

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    const data = await this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message', 'callback_query'],
    });

    return data.result ?? [];
  }

  private async requestForm<T = unknown>(
    method: string,
    body: FormData,
  ): Promise<TelegramResponse<T>> {
    const response = await fetch(
      `https://api.telegram.org/bot${this.token}/${method}`,
      {
        method: 'POST',
        body,
      },
    );

    const data = (await response.json()) as TelegramResponse<T>;

    if (!response.ok || !data.ok) {
      this.logger.error(
        `Telegram ${method} failed: ${response.status} ${data.description ?? ''}`,
      );
    }

    return data;
  }

  private async request<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramResponse<T>> {
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
        `Telegram ${method} failed: ${response.status} ${data.description ?? ''}`,
      );
    }

    return data;
  }

  private getPhotoContentType(filename: string): string {
    const extension = extname(filename).toLowerCase();

    if (extension === '.jpg' || extension === '.jpeg') {
      return 'image/jpeg';
    }

    if (extension === '.png') {
      return 'image/png';
    }

    if (extension === '.webp') {
      return 'image/webp';
    }

    return 'application/octet-stream';
  }
}
