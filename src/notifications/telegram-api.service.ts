import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { extname } from 'path';
import { TelegramUpdate } from '../bot/telegram.types';

type TelegramMarkup = Record<string, unknown>;
export type TelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};
type TelegramPhotoFile = {
  path: string;
  filename: string;
};
export type CreateChatInviteLinkInput = {
  chatId: string | number;
  name?: string;
  expireDate?: number;
  memberLimit?: number;
};
export type TelegramChatInviteLink = {
  invite_link: string;
  name?: string;
  expire_date?: number;
  member_limit?: number;
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
    caption?: string,
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

    if (caption) {
      form.set('caption', caption);
      form.set('parse_mode', 'HTML');
    }

    if (replyMarkup) {
      form.set('reply_markup', JSON.stringify(replyMarkup));
    }

    return this.requestForm('sendPhoto', form);
  }

  async sendPhotoBuffer(
    chatId: string | number,
    photo: Buffer,
    filename = 'broadcast-photo.jpg',
    replyMarkup?: TelegramMarkup,
    caption?: string,
  ) {
    const form = new FormData();
    const photoBuffer = this.toArrayBuffer(photo);
    form.set('chat_id', String(chatId));
    form.set(
      'photo',
      new Blob([photoBuffer], { type: this.getPhotoContentType(filename) }),
      filename,
    );

    if (caption) {
      form.set('caption', caption);
      form.set('parse_mode', 'HTML');
    }

    if (replyMarkup) {
      form.set('reply_markup', JSON.stringify(replyMarkup));
    }

    return this.requestForm('sendPhoto', form);
  }

  async sendPhotoMediaGroup(
    chatId: string | number,
    photos: TelegramPhotoFile[],
    caption?: string,
  ) {
    const form = new FormData();
    const media = photos.map((photo, index) => {
      const mediaItem: Record<string, unknown> = {
        type: 'photo',
        media: `attach://photo${index}`,
      };

      if (index === 0 && caption) {
        mediaItem.caption = caption;
        mediaItem.parse_mode = 'HTML';
      }

      form.set(
        `photo${index}`,
        new Blob([readFileSync(photo.path)], {
          type: this.getPhotoContentType(photo.filename),
        }),
        photo.filename,
      );

      return mediaItem;
    });

    form.set('chat_id', String(chatId));
    form.set('media', JSON.stringify(media));

    return this.requestForm('sendMediaGroup', form);
  }

  async sendVideoNoteFile(
    chatId: string | number,
    videoNote: Buffer,
    filename = 'video-note.mp4',
    replyMarkup?: TelegramMarkup,
  ) {
    const form = new FormData();
    const videoNoteBuffer = this.toArrayBuffer(videoNote);
    form.set('chat_id', String(chatId));
    form.set(
      'video_note',
      new Blob([videoNoteBuffer], { type: 'video/mp4' }),
      filename,
    );

    if (replyMarkup) {
      form.set('reply_markup', JSON.stringify(replyMarkup));
    }

    return this.requestForm('sendVideoNote', form);
  }

  async sendDocumentFile(
    chatId: string | number,
    documentPath: string,
    filename: string,
    replyMarkup?: TelegramMarkup,
    caption?: string,
  ) {
    const form = new FormData();
    form.set('chat_id', String(chatId));
    form.set(
      'document',
      new Blob([readFileSync(documentPath)], {
        type: this.getDocumentContentType(filename),
      }),
      filename,
    );

    if (caption) {
      form.set('caption', caption);
      form.set('parse_mode', 'HTML');
    }

    if (replyMarkup) {
      form.set('reply_markup', JSON.stringify(replyMarkup));
    }

    return this.requestForm('sendDocument', form);
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

  async deleteMessage(chatId: string | number, messageId: number) {
    return this.request('deleteMessage', {
      chat_id: chatId,
      message_id: messageId,
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

  async createChatInviteLink(input: CreateChatInviteLinkInput) {
    return this.request<TelegramChatInviteLink>('createChatInviteLink', {
      chat_id: input.chatId,
      name: input.name,
      expire_date: input.expireDate,
      member_limit: input.memberLimit,
    });
  }

  async getUpdates(offset?: number): Promise<TelegramUpdate[]> {
    const data = await this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message', 'callback_query'],
    });

    return data.result ?? [];
  }

  isBotBlockedByUser(response: TelegramResponse<unknown>): boolean {
    return (
      !response.ok &&
      (response.description
        ?.toLowerCase()
        .includes('bot was blocked by the user') ??
        false)
    );
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
      this.logger.error(this.formatError(method, response.status, data, body));
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
        this.formatError(method, response.status, data, payload),
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

  private getDocumentContentType(filename: string): string {
    if (extname(filename).toLowerCase() === '.pdf') {
      return 'application/pdf';
    }

    return 'application/octet-stream';
  }

  private toArrayBuffer(buffer: Buffer) {
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  }

  private formatError(
    method: string,
    status: number,
    data: TelegramResponse<unknown>,
    payload: FormData | Record<string, unknown>,
  ): string {
    const chatId = this.getPayloadValue(payload, 'chat_id');
    const userId = this.getPayloadValue(payload, 'user_id');
    const identifiers = [
      chatId !== undefined ? `chat_id=${chatId}` : undefined,
      userId !== undefined ? `user_id=${userId}` : undefined,
    ]
      .filter(Boolean)
      .join(', ');
    const suffix = identifiers ? ` (${identifiers})` : '';

    return `Telegram ${method} failed${suffix}: ${status} ${data.description ?? ''}`;
  }

  private getPayloadValue(
    payload: FormData | Record<string, unknown>,
    key: string,
  ): unknown {
    if (payload instanceof FormData) {
      return payload.get(key) ?? undefined;
    }

    return payload[key];
  }
}
