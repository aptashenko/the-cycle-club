import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { BotFlowService } from '../bot/bot-flow.service';
import { ProductType } from '../common/enums';
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
    private readonly flow: BotFlowService,
  ) {}

  async notifyPaymentSuccess(
    paymentAttempt: PaymentAttempt,
    subscription?: Subscription,
  ) {
    const isSubscriptionProduct =
      paymentAttempt.product.type === ProductType.Subscription;

    await this.telegram.sendMessage(
      paymentAttempt.user.telegramId,
      this.flow.getPaymentSuccessMessage(
        {
          productTitle: paymentAttempt.product.title,
          date: this.formatSubscriptionDate(subscription),
        },
        isSubscriptionProduct,
      ),
    );

    if (!isSubscriptionProduct) {
      await this.sendDownloadLinks(paymentAttempt);
    }

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
          [{ text: '🫂 Поддержка', callback_data: 'support:open' }],
        ],
      },
    );
  }

  async notifySubscriptionExpired(subscription: Subscription) {
    await this.telegram.sendMessage(
      subscription.user.telegramId,
      [
        '🔒 <b>Доступ к группе закрыт</b>',
        '',
        `Ваша подписка на ${subscription.product.title} закончилась.`,
        'Продлите, пожалуйста, подписку, чтобы снова получить доступ.',
      ].join('\n'),
      {
        inline_keyboard: [
          [
            {
              text: '💳 Продлить подписку',
              callback_data: `product:${subscription.product.slug}`,
            },
          ],
          [{ text: '🫂 Поддержка', callback_data: 'support:open' }],
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

  private async sendDownloadLinks(paymentAttempt: PaymentAttempt) {
    const downloadFiles = paymentAttempt.product.downloadFiles ?? [];

    if (downloadFiles.length === 0) {
      return;
    }

    await this.telegram.sendMessage(
      paymentAttempt.user.telegramId,
      this.flow.getDownloadMessage({
        productTitle: paymentAttempt.product.title,
      }),
      {
        inline_keyboard: downloadFiles.map((file) => [
          {
            text: file.title,
            url: this.buildDownloadUrl(file.url),
          },
        ]),
      },
    );
  }

  private buildDownloadUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const appUrl = this.config
      .get<string>('APP_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;

    return `${appUrl}${path}`;
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

  private formatSubscriptionDate(subscription?: Subscription) {
    if (!subscription?.expiresAt) {
      return '-';
    }

    return subscription.expiresAt.toLocaleDateString('ru-RU', {
      timeZone: 'Europe/Paris',
    });
  }
}
