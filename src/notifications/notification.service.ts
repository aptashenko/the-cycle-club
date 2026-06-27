import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { User } from '../users/user.entity';
import { TelegramApiService } from './telegram-api.service';

const RESOLVE_SUPPORT_PREFIX = 'support:resolve:';

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
      ].join('\n'),
      true,
      {
        inline_keyboard: [
          [
            {
              text: '✅ Завершить',
              callback_data: `${RESOLVE_SUPPORT_PREFIX}${request.id}`,
            },
          ],
        ],
      },
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

  async notifyPaymentFailed(paymentAttempt: PaymentAttempt) {
    const payload = paymentAttempt.rawPayload ?? {};

    await this.sendAdminMessage(
      [
        '❌ <b>Ошибка оплаты</b>',
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
        '<b>Provider:</b>',
        paymentAttempt.provider,
        '',
        '<b>Order:</b>',
        paymentAttempt.providerOrderId,
        '',
        '<b>Status:</b>',
        String(payload.transactionStatus ?? paymentAttempt.status),
        '',
        '<b>Reason code:</b>',
        String(payload.reasonCode ?? '-'),
      ].join('\n'),
    );
  }

  async notifySubscriptionExpiring(
    subscription: Subscription,
    daysBefore: 5 | 1,
  ) {
    const daysText = daysBefore === 1 ? '1 день' : '5 дней';
    const expiresText = subscription.expiresAt
      ? subscription.expiresAt.toLocaleDateString('ru-RU', {
          timeZone: 'Europe/Paris',
        })
      : '-';

    await this.telegram.sendMessage(
      subscription.user.telegramId,
      [
        '⏰ <b>Доступ скоро закончится</b>',
        '',
        `Продукт: ${subscription.product.title}`,
        `До окончания: ${daysText}`,
        `Активен до: ${expiresText}`,
        '',
        'Чтобы продлить доступ, оформите оплату заново.',
      ].join('\n'),
      {
        inline_keyboard: [
          [
            {
              text: '💳 Продлить доступ',
              callback_data: `product:${subscription.product.slug}`,
            },
          ],
          [{ text: '💬 Саппорт', callback_data: 'support:open' }],
        ],
      },
    );
  }

  private async sendAdminMessage(
    text: string,
    includeManager = false,
    replyMarkup?: Record<string, unknown>,
  ) {
    const recipients = this.getAdminRecipients(includeManager);

    await Promise.all(
      recipients.map((chatId) =>
        this.adminTelegram.sendMessage(chatId, text, replyMarkup),
      ),
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
