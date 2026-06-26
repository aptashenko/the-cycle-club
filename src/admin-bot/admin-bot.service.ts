import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramMessage, TelegramUpdate } from '../bot/telegram.types';
import {
  PaymentAttemptStatus,
  SubscriptionStatus,
  SupportRequestStatus,
} from '../common/enums';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminTelegramApiService } from './admin-telegram-api.service';

@Injectable()
export class AdminBotService {
  private readonly adminIds: Set<string>;

  constructor(
    private readonly telegram: AdminTelegramApiService,
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PaymentAttempt)
    private readonly payments: Repository<PaymentAttempt>,
    @InjectRepository(SupportRequest)
    private readonly supportRequests: Repository<SupportRequest>,
    @InjectRepository(UserActivityEvent)
    private readonly activity: Repository<UserActivityEvent>,
  ) {
    const ids = [
      ...this.config.get<string>('ADMIN_TELEGRAM_IDS', '').split(','),
      this.config.get<string>('ADMIN_TELEGRAM_ID', ''),
    ]
      .map((id) => id.trim())
      .filter(Boolean);

    this.adminIds = new Set(ids);
  }

  async handleUpdate(update: TelegramUpdate) {
    if (!update.message?.from || !update.message.text) {
      return;
    }

    const message = update.message;
    const from = message.from;
    if (!from || !this.isAdmin(from.id)) {
      await this.telegram.sendMessage(message.chat.id, 'Access denied.');
      return;
    }

    await this.handleMessage(message);
  }

  private async handleMessage(message: TelegramMessage) {
    const text = message.text?.trim() ?? '';
    const [command, ...args] = text.split(/\s+/);
    const chatId = message.chat.id;

    if (command === '/start' || command === '/help') {
      await this.sendHelp(chatId);
      return;
    }

    if (command === '/stats') {
      await this.sendStats(chatId);
      return;
    }

    if (command === '/support') {
      await this.sendSupport(chatId);
      return;
    }

    if (command === '/resolve_support') {
      await this.resolveSupport(chatId, args[0]);
      return;
    }

    if (command === '/user') {
      await this.sendUser(chatId, args[0]);
      return;
    }

    if (command === '/payments') {
      await this.sendPayments(chatId, args[0]);
      return;
    }

    if (command === '/subscriptions') {
      await this.sendSubscriptions(chatId, args[0]);
      return;
    }

    if (command === '/activity') {
      await this.sendActivity(chatId, args[0]);
      return;
    }

    await this.telegram.sendMessage(chatId, 'Unknown command. Use /help.');
  }

  private isAdmin(telegramId: number) {
    return this.adminIds.has(String(telegramId));
  }

  private async sendHelp(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      [
        '<b>The Cycle Admin</b>',
        '',
        '/stats - summary',
        '/support - open support requests',
        '/resolve_support &lt;request_id&gt; - mark support request resolved',
        '/user &lt;telegram_id&gt; - user profile',
        '/payments &lt;telegram_id&gt; - latest payments',
        '/subscriptions &lt;telegram_id&gt; - user subscriptions',
        '/activity &lt;telegram_id&gt; - user path',
      ].join('\n'),
    );
  }

  private async sendStats(chatId: string | number) {
    const [
      usersCount,
      activeSubscriptions,
      pendingPayments,
      paidPayments,
      failedPayments,
      openSupport,
    ] = await Promise.all([
      this.users.count(),
      this.subscriptions.count({
        where: { status: SubscriptionStatus.Active },
      }),
      this.payments.count({ where: { status: PaymentAttemptStatus.Pending } }),
      this.payments.count({ where: { status: PaymentAttemptStatus.Paid } }),
      this.payments.count({ where: { status: PaymentAttemptStatus.Failed } }),
      this.supportRequests.count({
        where: { status: SupportRequestStatus.Open },
      }),
    ]);

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Stats</b>',
        '',
        `Users: ${usersCount}`,
        `Active subscriptions: ${activeSubscriptions}`,
        `Payments pending: ${pendingPayments}`,
        `Payments paid: ${paidPayments}`,
        `Payments failed: ${failedPayments}`,
        `Open support: ${openSupport}`,
      ].join('\n'),
    );
  }

  private async sendUser(chatId: string | number, telegramId?: string) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const [subscriptionsCount, paymentsCount, activityCount] =
      await Promise.all([
        this.subscriptions.count({ where: { userId: user.id } }),
        this.payments.count({ where: { userId: user.id } }),
        this.activity.count({ where: { userId: user.id } }),
      ]);

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>User</b>',
        '',
        `Telegram ID: <code>${this.escape(user.telegramId)}</code>`,
        `Username: ${this.escape(user.username ? `@${user.username}` : '-')}`,
        `Name: ${this.escape([user.firstName, user.lastName].filter(Boolean).join(' ') || '-')}`,
        `Language: ${this.escape(user.languageCode ?? '-')}`,
        `Membership: ${this.escape(user.membershipStatus)}`,
        `Created: ${this.formatDate(user.createdAt)}`,
        '',
        `Subscriptions: ${subscriptionsCount}`,
        `Payments: ${paymentsCount}`,
        `Activity events: ${activityCount}`,
      ].join('\n'),
    );
  }

  private async sendPayments(chatId: string | number, telegramId?: string) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const payments = await this.payments.find({
      where: { userId: user.id },
      relations: { product: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (payments.length === 0) {
      await this.telegram.sendMessage(chatId, 'No payments found.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Payments for ${this.escape(user.telegramId)}</b>`,
        '',
        ...payments.map((payment) =>
          [
            `${this.formatDate(payment.createdAt)} - <b>${this.escape(payment.status)}</b>`,
            `${this.escape(payment.product.title)}: ${this.escape(payment.amount)} ${this.escape(payment.currency)}`,
            `Provider: ${this.escape(payment.provider)}`,
            `Order: <code>${this.escape(payment.providerOrderId)}</code>`,
            payment.paidAt ? `Paid: ${this.formatDate(payment.paidAt)}` : '',
            payment.rawPayload?.reasonCode
              ? `Reason: ${this.escape(String(payment.rawPayload.reasonCode))}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async sendSubscriptions(
    chatId: string | number,
    telegramId?: string,
  ) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const subscriptions = await this.subscriptions.find({
      where: { userId: user.id },
      relations: { product: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (subscriptions.length === 0) {
      await this.telegram.sendMessage(chatId, 'No subscriptions found.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Subscriptions for ${this.escape(user.telegramId)}</b>`,
        '',
        ...subscriptions.map((subscription) =>
          [
            `<b>${this.escape(subscription.product.title)}</b>`,
            `Status: ${this.escape(subscription.status)}`,
            `Starts: ${this.formatDate(subscription.startsAt)}`,
            `Expires: ${this.formatDate(subscription.expiresAt)}`,
          ].join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async sendActivity(chatId: string | number, telegramId?: string) {
    const user = await this.findUserOrReply(chatId, telegramId);
    if (!user) {
      return;
    }

    const events = await this.activity.find({
      where: { userId: user.id },
      order: { createdAt: 'ASC' },
      take: 30,
    });

    if (events.length === 0) {
      await this.telegram.sendMessage(chatId, 'No activity found.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        `<b>Activity for ${this.escape(user.telegramId)}</b>`,
        '',
        ...events.map((event) =>
          [
            `${this.formatDate(event.createdAt)} - <b>${this.escape(event.eventName)}</b>`,
            `Type: ${this.escape(event.eventType)}`,
            this.formatPayload(event.payload),
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async sendSupport(chatId: string | number) {
    const requests = await this.supportRequests.find({
      where: { status: SupportRequestStatus.Open },
      relations: { user: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (requests.length === 0) {
      await this.telegram.sendMessage(chatId, 'No open support requests.');
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Open support requests</b>',
        '',
        ...requests.map((request) =>
          [
            `${this.formatDate(request.createdAt)} - ${this.escape(request.topic)}`,
            `ID: <code>${this.escape(request.id)}</code>`,
            `User: ${this.formatUser(request.user)}`,
            `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
            `Resolve: <code>/resolve_support ${this.escape(request.id)}</code>`,
          ].join('\n'),
        ),
      ].join('\n\n'),
    );
  }

  private async resolveSupport(chatId: string | number, requestId?: string) {
    if (!requestId) {
      await this.telegram.sendMessage(
        chatId,
        'Usage: /resolve_support &lt;request_id&gt;',
      );
      return;
    }

    const request = await this.supportRequests.findOne({
      where: { id: requestId },
      relations: { user: true },
    });

    if (!request) {
      await this.telegram.sendMessage(chatId, 'Support request not found.');
      return;
    }

    if (request.status === SupportRequestStatus.Resolved) {
      await this.telegram.sendMessage(
        chatId,
        'Support request is already resolved.',
      );
      return;
    }

    request.status = SupportRequestStatus.Resolved;
    request.resolvedAt = new Date();
    await this.supportRequests.save(request);

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Support request resolved</b>',
        '',
        `ID: <code>${this.escape(request.id)}</code>`,
        `User: ${this.formatUser(request.user)}`,
        `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
        `Topic: ${this.escape(request.topic)}`,
      ].join('\n'),
    );
  }

  private async findUserOrReply(chatId: string | number, telegramId?: string) {
    if (!telegramId) {
      await this.telegram.sendMessage(
        chatId,
        'Usage: /user &lt;telegram_id&gt;',
      );
      return null;
    }

    const user = await this.users.findOne({ where: { telegramId } });
    if (!user) {
      await this.telegram.sendMessage(chatId, 'User not found.');
      return null;
    }

    return user;
  }

  private formatUser(user: User) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const username = user.username ? `@${user.username}` : '';
    return this.escape([name, username].filter(Boolean).join(' ') || '-');
  }

  private formatPayload(payload?: Record<string, unknown>) {
    if (!payload) {
      return '';
    }

    const allowedKeys = [
      'text',
      'productSlug',
      'amount',
      'currency',
      'paymentAttemptId',
      'transactionStatus',
      'reasonCode',
    ];

    return allowedKeys
      .filter((key) => payload[key] !== undefined)
      .map((key) => `${key}: ${this.escape(String(payload[key]))}`)
      .join('\n');
  }

  private formatDate(date?: Date) {
    if (!date) {
      return '-';
    }

    return date.toLocaleString('ru-RU', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
