import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';

type CriticalErrorInput = {
  source: string;
  message: string;
  stack?: string;
  details?: Record<string, unknown>;
};

@Injectable()
export class CriticalErrorService {
  private readonly logger = new Logger(CriticalErrorService.name);
  private readonly lastSentAt = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly adminTelegram: AdminTelegramApiService,
  ) {}

  async notify(input: CriticalErrorInput) {
    const recipients = this.getAdminRecipients();
    if (recipients.length === 0 || !this.shouldSend(input)) {
      return;
    }

    const text = this.formatMessage(input);

    await Promise.all(
      recipients.map(async (chatId) => {
        try {
          await this.adminTelegram.sendMessage(chatId, text);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to send critical alert: ${message}`);
        }
      }),
    );
  }

  private shouldSend(input: CriticalErrorInput) {
    const key = `${input.source}:${input.message}`;
    const now = Date.now();
    const lastSentAt = this.lastSentAt.get(key) ?? 0;

    if (now - lastSentAt < 60_000) {
      return false;
    }

    this.lastSentAt.set(key, now);
    return true;
  }

  private getAdminRecipients() {
    const ids = this.config
      .get<string>('ADMIN_TELEGRAM_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const legacyAdminId = this.config.get<string>('ADMIN_TELEGRAM_ID');
    if (legacyAdminId) {
      ids.push(legacyAdminId);
    }

    return [...new Set(ids)];
  }

  private formatMessage(input: CriticalErrorInput) {
    const stack = input.stack ? this.truncate(input.stack, 1200) : '-';
    const details = input.details
      ? this.truncate(JSON.stringify(input.details, null, 2), 900)
      : '-';

    return [
      '🚨 <b>Critical error</b>',
      '',
      `<b>Source:</b> ${this.escape(input.source)}`,
      `<b>Message:</b> ${this.escape(input.message)}`,
      '',
      '<b>Details:</b>',
      `<pre>${this.escape(details)}</pre>`,
      '',
      '<b>Stack:</b>',
      `<pre>${this.escape(stack)}</pre>`,
    ].join('\n');
  }

  private truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
