import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { SupportRequest } from '../support/support-request.entity';
import { User } from '../users/user.entity';
import { TelegramApiService } from './telegram-api.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramApiService,
    private readonly adminTelegram: AdminTelegramApiService,
  ) {}

  async notifyPaymentSuccess(paymentAttempt: PaymentAttempt) {
    await this.telegram.sendMessage(
      paymentAttempt.user.telegramId,
      '✅ Оплата прошла успешно. Ваша подписка The Cycle активирована ❤️',
    );

    await this.sendAdminMessage(
      [
        '✅ <b>Новая оплата</b>',
        '',
        '<b>Пользователь:</b>',
        this.formatUser(paymentAttempt.user),
        '',
        '<b>ID:</b>',
        paymentAttempt.user.telegramId,
        '',
        '<b>Продукт:</b>',
        paymentAttempt.product.title,
        '',
        '<b>Сумма:</b>',
        `${paymentAttempt.amount} ${paymentAttempt.currency}`,
        '',
        '<b>Дата:</b>',
        paymentAttempt.paidAt?.toISOString() ?? new Date().toISOString(),
        '',
        '<b>Transaction ID:</b>',
        paymentAttempt.providerTransactionId ?? '-',
        '',
        '<b>Открыть пользователя:</b>',
        `tg://user?id=${paymentAttempt.user.telegramId}`,
      ].join('\n'),
    );
  }

  async notifySupportRequest(request: SupportRequest) {
    await this.sendAdminMessage(
      [
        '💬 <b>Новое обращение в поддержку</b>',
        '',
        '<b>Пользователь:</b>',
        this.formatUser(request.user),
        '',
        '<b>ID:</b>',
        request.user.telegramId,
        '',
        '<b>Тема:</b>',
        request.topic,
        '',
        '<b>Открыть пользователя:</b>',
        `tg://user?id=${request.user.telegramId}`,
      ].join('\n'),
      true,
    );
  }

  async notifyAbandonedPayment(paymentAttempt: PaymentAttempt) {
    await this.telegram.sendMessage(
      paymentAttempt.user.telegramId,
      'Вы начали оформление участия, но оплата не была завершена.\n\nЕсли возникла проблема — напишите в поддержку.',
      {
        inline_keyboard: [
          [
            {
              text: '💳 Завершить оплату',
              url: paymentAttempt.paymentUrl,
            },
          ],
          [{ text: '💬 Саппорт', callback_data: 'support:open' }],
        ],
      },
    );

    await this.sendAdminMessage(
      [
        '⚠️ <b>Оплата не завершена</b>',
        '',
        '<b>Пользователь:</b>',
        this.formatUser(paymentAttempt.user),
        '',
        '<b>ID:</b>',
        paymentAttempt.user.telegramId,
        '',
        '<b>Продукт:</b>',
        paymentAttempt.product.title,
        '',
        '<b>Сумма:</b>',
        `${paymentAttempt.amount} ${paymentAttempt.currency}`,
      ].join('\n'),
    );
  }

  private async sendAdminMessage(text: string, includeManager = false) {
    const recipients = this.getAdminRecipients(includeManager);

    await Promise.all(
      recipients.map((chatId) => this.adminTelegram.sendMessage(chatId, text)),
    );
  }

  private getAdminRecipients(includeManager: boolean) {
    const ids = this.config
      .get<string>('ADMIN_TELEGRAM_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const legacyAdminId = this.config.get<string>('ADMIN_TELEGRAM_ID');
    if (legacyAdminId) {
      ids.push(legacyAdminId);
    }

    const managerId = this.config.get<string>('MANAGER_TELEGRAM_ID');
    if (includeManager && managerId) {
      ids.push(managerId);
    }

    return [...new Set(ids)];
  }

  private formatUser(user: User) {
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const username = user.username ? `(@${user.username})` : '';

    return [fullName || 'Без имени', username].filter(Boolean).join(' ');
  }
}
