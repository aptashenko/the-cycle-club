import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { TelegramMessage, TelegramUpdate } from '../bot/telegram.types';
import {
  PaymentAttemptStatus,
  SubscriptionStatus,
  SupportRequestStatus,
} from '../common/enums';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminTelegramApiService } from './admin-telegram-api.service';

const RESOLVE_SUPPORT_PREFIX = 'support:resolve:';
const ADMIN_MENU_PREFIX = 'admin:menu:';
const GRANT_SUBSCRIPTION_PRODUCT_SLUG = 'the-cycle';
const MARATHON_PRODUCT_SLUG_PREFIX = 'marathon-';
const MARATHON_FLOW_ACTION_PREFIX = 'marathon:';
const BROADCAST_BATCH_SIZE = 100;
const BROADCAST_SEND_DELAY_MS = 50;
const BROADCAST_CONFIRM_BUTTON = '✅ Подтвердить рассылку';
const BROADCAST_CANCEL_BUTTON = '❌ Отмена';
const BROADCAST_SKIP_BUTTON = 'Без кнопки';

type GrantSubscriptionSession =
  | {
      step: 'username';
    }
  | {
      step: 'expiresAt';
      username: string;
    };

type BroadcastSession =
  | {
      step: 'message';
    }
  | {
      step: 'buttonText';
      text: string;
    }
  | {
      step: 'buttonUrl';
      text: string;
      buttonText: string;
    }
  | {
      step: 'confirm';
      text: string;
      recipientsCount: number;
      button?: BroadcastButton;
    };

type BroadcastButton = {
  text: string;
  url: string;
};

@Injectable()
export class AdminBotService {
  private readonly adminIds: Set<string>;
  private readonly grantSubscriptionSessions = new Map<
    string,
    GrantSubscriptionSession
  >();
  private readonly broadcastSessions = new Map<string, BroadcastSession>();
  private broadcastInProgress = false;

  constructor(
    private readonly telegram: AdminTelegramApiService,
    private readonly mainTelegram: TelegramApiService,
    private readonly config: ConfigService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
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
    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
      return;
    }

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

  private async handleCallback(
    callbackQuery: TelegramUpdate['callback_query'],
  ) {
    if (!callbackQuery) {
      return;
    }

    const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id;

    if (!this.isAdmin(callbackQuery.from.id)) {
      await this.telegram.answerCallbackQuery(
        callbackQuery.id,
        'Access denied.',
      );
      return;
    }

    const data = callbackQuery.data;
    if (!data) {
      await this.telegram.answerCallbackQuery(callbackQuery.id);
      return;
    }

    if (data.startsWith(RESOLVE_SUPPORT_PREFIX)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, 'Resolving...');
      await this.resolveSupport(
        chatId,
        data.slice(RESOLVE_SUPPORT_PREFIX.length),
        callbackQuery.message?.message_id,
      );
      return;
    }

    if (data.startsWith(ADMIN_MENU_PREFIX)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id);
      await this.handleMenuAction(chatId, data.slice(ADMIN_MENU_PREFIX.length));
      return;
    }

    await this.telegram.answerCallbackQuery(callbackQuery.id);
  }

  private async handleMessage(message: TelegramMessage) {
    const text = message.text?.trim() ?? '';
    const [command, ...args] = text.split(/\s+/);
    const chatId = message.chat.id;

    const grantSession = this.grantSubscriptionSessions.get(String(chatId));
    if (grantSession) {
      if (command === '/cancel') {
        this.grantSubscriptionSessions.delete(String(chatId));
        await this.telegram.sendMessage(
          chatId,
          'Subscription grant cancelled.',
        );
        return;
      }

      await this.handleGrantSubscriptionStep(chatId, text, grantSession);
      return;
    }

    const broadcastSession = this.broadcastSessions.get(String(chatId));
    if (broadcastSession) {
      if (command === '/cancel' || text === BROADCAST_CANCEL_BUTTON) {
        this.broadcastSessions.delete(String(chatId));
        await this.telegram.sendMessage(
          chatId,
          'Broadcast cancelled.',
          this.getRemoveKeyboardMarkup(),
        );
        return;
      }

      await this.handleBroadcastStep(chatId, text, command, broadcastSession);
      return;
    }

    if (command === '/start' || command === '/help' || command === '/menu') {
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

    if (command === '/marathons') {
      await this.sendMarathonFlows(chatId);
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

    if (command === '/grant_subscription') {
      await this.startGrantSubscription(chatId);
      return;
    }

    if (command === '/broadcast') {
      await this.startBroadcast(chatId);
      return;
    }

    if (command === '/activity') {
      await this.sendActivity(chatId, args[0]);
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      'Unknown command. Use /help or /menu.',
      this.getAdminMenuMarkup(),
    );
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
        'Use buttons below or send a command manually.',
        '',
        '/stats - summary',
        '/support - open support requests',
        '/marathons - marathon flow payments',
        '/resolve_support &lt;request_id&gt; - mark support request resolved',
        '/user &lt;telegram_id&gt; - user profile',
        '/payments &lt;telegram_id&gt; - latest payments',
        '/subscriptions &lt;telegram_id&gt; - user subscriptions',
        '/grant_subscription - grant The Cycle subscription by username',
        '/broadcast - send a text broadcast from the main bot',
        '/activity &lt;telegram_id&gt; - user path',
        '/cancel - cancel current dialog',
      ].join('\n'),
      this.getAdminMenuMarkup(),
    );
  }

  private async handleMenuAction(chatId: string | number, action: string) {
    if (action === 'menu') {
      await this.sendHelp(chatId);
      return;
    }

    if (action === 'stats') {
      await this.sendStats(chatId);
      return;
    }

    if (action === 'support') {
      await this.sendSupport(chatId);
      return;
    }

    if (action === 'marathons') {
      await this.sendMarathonFlows(chatId);
      return;
    }

    if (action.startsWith(MARATHON_FLOW_ACTION_PREFIX)) {
      await this.sendMarathonPayments(
        chatId,
        action.slice(MARATHON_FLOW_ACTION_PREFIX.length),
      );
      return;
    }

    if (action === 'grant_subscription') {
      await this.startGrantSubscription(chatId);
      return;
    }

    if (action === 'broadcast') {
      await this.startBroadcast(chatId);
      return;
    }

    if (action === 'user') {
      await this.sendCommandHint(
        chatId,
        'User profile',
        '/user &lt;telegram_id&gt;',
        '/user 123456789',
      );
      return;
    }

    if (action === 'payments') {
      await this.sendCommandHint(
        chatId,
        'Latest payments',
        '/payments &lt;telegram_id&gt;',
        '/payments 123456789',
      );
      return;
    }

    if (action === 'subscriptions') {
      await this.sendCommandHint(
        chatId,
        'User subscriptions',
        '/subscriptions &lt;telegram_id&gt;',
        '/subscriptions 123456789',
      );
      return;
    }

    if (action === 'activity') {
      await this.sendCommandHint(
        chatId,
        'User activity',
        '/activity &lt;telegram_id&gt;',
        '/activity 123456789',
      );
      return;
    }

    await this.sendHelp(chatId);
  }

  private async sendCommandHint(
    chatId: string | number,
    title: string,
    usage: string,
    example: string,
  ) {
    await this.telegram.sendMessage(
      chatId,
      [
        `<b>${this.escape(title)}</b>`,
        '',
        `Usage: <code>${usage}</code>`,
        `Example: <code>${example}</code>`,
      ].join('\n'),
      this.getAdminMenuMarkup(),
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

  private async sendMarathonFlows(chatId: string | number) {
    const products = await this.products.find({
      where: { slug: Like(`${MARATHON_PRODUCT_SLUG_PREFIX}%`) },
      order: { createdAt: 'ASC' },
    });

    if (products.length === 0) {
      await this.telegram.sendMessage(chatId, 'No marathon flows found.');
      return;
    }

    const sortedProducts = [...products].sort((a, b) => {
      const flowNumberDiff =
        this.getMarathonFlowNumber(a) - this.getMarathonFlowNumber(b);

      return flowNumberDiff || a.slug.localeCompare(b.slug);
    });

    await this.telegram.sendMessage(
      chatId,
      '<b>Марафоны</b>\n\nВыберите поток:',
      {
        inline_keyboard: [
          ...sortedProducts.map((product) => [
            {
              text: this.getMarathonFlowButtonText(product),
              callback_data: `${ADMIN_MENU_PREFIX}${MARATHON_FLOW_ACTION_PREFIX}${product.slug}`,
            },
          ]),
          [
            {
              text: '☰ Меню',
              callback_data: `${ADMIN_MENU_PREFIX}menu`,
            },
          ],
        ],
      },
    );
  }

  private async sendMarathonPayments(
    chatId: string | number,
    productSlug: string,
  ) {
    if (!productSlug.startsWith(MARATHON_PRODUCT_SLUG_PREFIX)) {
      await this.telegram.sendMessage(chatId, 'Unknown marathon flow.');
      return;
    }

    const product = await this.products.findOne({
      where: { slug: productSlug },
    });

    if (!product) {
      await this.telegram.sendMessage(chatId, 'Marathon flow not found.');
      return;
    }

    const summary = await this.payments
      .createQueryBuilder('payment')
      .select('COUNT(payment.id)', 'count')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'amount')
      .where('payment.productId = :productId', { productId: product.id })
      .andWhere('payment.status = :status', {
        status: PaymentAttemptStatus.Paid,
      })
      .getRawOne<{ count: string; amount: string }>();
    const paidCount = Number(summary?.count ?? 0);
    const totalAmount = summary?.amount ?? '0.00';

    const payments = await this.payments.find({
      where: {
        productId: product.id,
        status: PaymentAttemptStatus.Paid,
      },
      relations: { user: true },
      order: { paidAt: 'DESC', createdAt: 'DESC' },
      take: 50,
    });

    const lines = [
      `<b>${this.escape(product.title)}</b>`,
      '',
      `Оплат: ${paidCount}`,
      `Сумма: ${this.escape(totalAmount)} ${this.escape(product.currency)}`,
    ];

    if (payments.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        [...lines, '', 'Оплат пока нет.'].join('\n'),
      );
      return;
    }

    await this.telegram.sendMessage(
      chatId,
      [
        ...lines,
        '',
        paidCount > payments.length
          ? `<i>Показаны последние ${payments.length} из ${paidCount} оплат.</i>`
          : '',
        ...payments.map((payment, index) =>
          [
            `${index + 1}. ${this.formatUser(payment.user)}`,
            `Telegram ID: <code>${this.escape(payment.user.telegramId)}</code>`,
            `Сумма: ${this.escape(payment.amount)} ${this.escape(payment.currency)}`,
            `Дата оплаты: ${this.formatDate(payment.paidAt)}`,
          ].join('\n'),
        ),
      ]
        .filter(Boolean)
        .join('\n\n'),
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

  private async startGrantSubscription(chatId: string | number) {
    this.grantSubscriptionSessions.set(String(chatId), { step: 'username' });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Grant The Cycle subscription</b>',
        '',
        'Send user username, for example: <code>@username</code>',
        'Use /cancel to cancel.',
      ].join('\n'),
    );
  }

  private async handleGrantSubscriptionStep(
    chatId: string | number,
    text: string,
    session: GrantSubscriptionSession,
  ) {
    if (session.step === 'username') {
      const username = this.normalizeUsername(text);

      if (!username) {
        await this.telegram.sendMessage(
          chatId,
          'Send a valid Telegram username, for example: <code>@username</code>',
        );
        return;
      }

      const user = await this.findUserByUsername(username);
      if (!user) {
        await this.telegram.sendMessage(
          chatId,
          `User @${this.escape(username)} not found. Send another username or /cancel.`,
        );
        return;
      }

      this.grantSubscriptionSessions.set(String(chatId), {
        step: 'expiresAt',
        username,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          `User found: ${this.formatUser(user)}`,
          '',
          'Send subscription end date.',
          'Formats: <code>31.12.2026</code>, <code>2026-12-31</code>, or <code>31.12.2026 18:30</code>.',
        ].join('\n'),
      );
      return;
    }

    const expiresAt = this.parseSubscriptionEndDate(text);
    if (!expiresAt) {
      await this.telegram.sendMessage(
        chatId,
        [
          'Invalid date.',
          'Use <code>31.12.2026</code>, <code>2026-12-31</code>, or <code>31.12.2026 18:30</code>.',
        ].join('\n'),
      );
      return;
    }

    if (expiresAt <= new Date()) {
      await this.telegram.sendMessage(
        chatId,
        'Date must be in the future. Send another date or /cancel.',
      );
      return;
    }

    const user = await this.findUserByUsername(session.username);
    if (!user) {
      this.grantSubscriptionSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        `User @${this.escape(session.username)} no longer exists. Start again with /grant_subscription.`,
      );
      return;
    }

    const product = await this.products.findOne({
      where: { slug: GRANT_SUBSCRIPTION_PRODUCT_SLUG },
    });
    if (!product) {
      this.grantSubscriptionSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        `Product ${this.escape(GRANT_SUBSCRIPTION_PRODUCT_SLUG)} not found.`,
      );
      return;
    }

    const subscription = await this.grantSubscription(user, product, expiresAt);
    this.grantSubscriptionSessions.delete(String(chatId));

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Subscription granted</b>',
        '',
        `User: ${this.formatUser(user)}`,
        `Telegram ID: <code>${this.escape(user.telegramId)}</code>`,
        `Product: ${this.escape(product.title)}`,
        `Status: ${this.escape(subscription.status)}`,
        `Expires: ${this.formatDate(subscription.expiresAt)}`,
      ].join('\n'),
    );
  }

  private async grantSubscription(
    user: User,
    product: Product,
    expiresAt: Date,
  ) {
    let subscription = await this.subscriptions.findOne({
      where: {
        userId: user.id,
        productId: product.id,
        status: SubscriptionStatus.Active,
      },
    });

    if (!subscription) {
      subscription = this.subscriptions.create({
        user,
        userId: user.id,
        product,
        productId: product.id,
      });
    }

    subscription.status = SubscriptionStatus.Active;
    subscription.startsAt = subscription.startsAt ?? new Date();
    subscription.expiresAt = expiresAt;
    subscription.reminded5DaysAt = null;
    subscription.reminded1DayAt = null;
    user.membershipStatus = 'active';

    const saved = await this.subscriptions.save(subscription);
    await this.users.save(user);

    return saved;
  }

  private getAdminMenuMarkup() {
    return {
      inline_keyboard: [
        [
          {
            text: '📊 Статистика',
            callback_data: `${ADMIN_MENU_PREFIX}stats`,
          },
          {
            text: '💬 Поддержка',
            callback_data: `${ADMIN_MENU_PREFIX}support`,
          },
        ],
        [
          {
            text: '🏁 Марафоны',
            callback_data: `${ADMIN_MENU_PREFIX}marathons`,
          },
        ],
        [
          {
            text: '👤 Пользователь',
            callback_data: `${ADMIN_MENU_PREFIX}user`,
          },
          {
            text: '💳 Платежи',
            callback_data: `${ADMIN_MENU_PREFIX}payments`,
          },
        ],
        [
          {
            text: '🎟 Подписки',
            callback_data: `${ADMIN_MENU_PREFIX}subscriptions`,
          },
          {
            text: '🧭 Активность',
            callback_data: `${ADMIN_MENU_PREFIX}activity`,
          },
        ],
        [
          {
            text: '➕ Выдать подписку',
            callback_data: `${ADMIN_MENU_PREFIX}grant_subscription`,
          },
          {
            text: '📣 Рассылка',
            callback_data: `${ADMIN_MENU_PREFIX}broadcast`,
          },
        ],
        [
          {
            text: '☰ Меню',
            callback_data: `${ADMIN_MENU_PREFIX}menu`,
          },
        ],
      ],
    };
  }

  private getBroadcastTextKeyboardMarkup() {
    return {
      keyboard: [[{ text: BROADCAST_CANCEL_BUTTON }]],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastConfirmKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: BROADCAST_CONFIRM_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastButtonTextKeyboardMarkup() {
    return {
      keyboard: [
        [{ text: BROADCAST_SKIP_BUTTON }],
        [{ text: BROADCAST_CANCEL_BUTTON }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      selective: true,
    };
  }

  private getBroadcastInlineButtonMarkup(button?: BroadcastButton) {
    if (!button) {
      return undefined;
    }

    return {
      inline_keyboard: [[{ text: button.text, url: button.url }]],
    };
  }

  private getRemoveKeyboardMarkup() {
    return {
      remove_keyboard: true,
      selective: true,
    };
  }

  private async startBroadcast(chatId: string | number) {
    if (this.broadcastInProgress) {
      await this.telegram.sendMessage(
        chatId,
        'Another broadcast is already running. Try again later.',
      );
      return;
    }

    this.broadcastSessions.set(String(chatId), { step: 'message' });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Broadcast from main bot</b>',
        '',
        'Send the text message for all users.',
        'The text will be sent as plain text from the main bot.',
        `After that you can add one URL button or tap ${BROADCAST_SKIP_BUTTON}.`,
        `Use ${BROADCAST_CANCEL_BUTTON} or /cancel to cancel.`,
      ].join('\n'),
      this.getBroadcastTextKeyboardMarkup(),
    );
  }

  private async handleBroadcastStep(
    chatId: string | number,
    text: string,
    command: string,
    session: BroadcastSession,
  ) {
    if (session.step === 'message') {
      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send a non-empty broadcast text or cancel the broadcast.',
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.set(String(chatId), {
        step: 'buttonText',
        text,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          '<b>Broadcast button</b>',
          '',
          `Send button text, or tap ${BROADCAST_SKIP_BUTTON}.`,
          'Example: Купить',
        ].join('\n'),
        this.getBroadcastButtonTextKeyboardMarkup(),
      );
      return;
    }

    if (session.step === 'buttonText') {
      if (text === BROADCAST_SKIP_BUTTON) {
        await this.prepareBroadcastPreview(chatId, session.text);
        return;
      }

      if (!text || text.startsWith('/')) {
        await this.telegram.sendMessage(
          chatId,
          'Send button text or skip the button.',
          this.getBroadcastButtonTextKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.set(String(chatId), {
        step: 'buttonUrl',
        text: session.text,
        buttonText: text,
      });

      await this.telegram.sendMessage(
        chatId,
        [
          '<b>Broadcast button URL</b>',
          '',
          'Send the button URL.',
          'Example: https://example.com',
        ].join('\n'),
        this.getBroadcastTextKeyboardMarkup(),
      );
      return;
    }

    if (session.step === 'buttonUrl') {
      const buttonUrl = this.normalizeBroadcastButtonUrl(text);
      if (!buttonUrl) {
        await this.telegram.sendMessage(
          chatId,
          'Send a valid http:// or https:// URL for the button.',
          this.getBroadcastTextKeyboardMarkup(),
        );
        return;
      }

      await this.prepareBroadcastPreview(chatId, session.text, {
        text: session.buttonText,
        url: buttonUrl,
      });
      return;
    }

    if (session.step === 'confirm') {
      if (
        command !== '/confirm_broadcast' &&
        text !== BROADCAST_CONFIRM_BUTTON
      ) {
        await this.telegram.sendMessage(
          chatId,
          'Confirm or cancel the broadcast with the buttons below.',
          this.getBroadcastConfirmKeyboardMarkup(),
        );
        return;
      }

      if (this.broadcastInProgress) {
        this.broadcastSessions.delete(String(chatId));
        await this.telegram.sendMessage(
          chatId,
          'Another broadcast is already running. Try again later.',
          this.getRemoveKeyboardMarkup(),
        );
        return;
      }

      this.broadcastSessions.delete(String(chatId));
      this.broadcastInProgress = true;

      await this.telegram.sendMessage(
        chatId,
        `Broadcast started for ${session.recipientsCount} users.`,
        this.getRemoveKeyboardMarkup(),
      );

      void this.runBroadcast(chatId, session.text, session.button).catch(
        async (error: unknown) => {
          await this.telegram.sendMessage(
            chatId,
            `Broadcast failed: ${this.escape(error instanceof Error ? error.message : String(error))}`,
            this.getRemoveKeyboardMarkup(),
          );
        },
      );
    }
  }

  private async prepareBroadcastPreview(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
  ) {
    const recipientsCount = await this.users.count();
    if (recipientsCount === 0) {
      this.broadcastSessions.delete(String(chatId));
      await this.telegram.sendMessage(
        chatId,
        'No users to broadcast to.',
        this.getRemoveKeyboardMarkup(),
      );
      return;
    }

    this.broadcastSessions.set(String(chatId), {
      step: 'confirm',
      text,
      recipientsCount,
      button,
    });

    await this.telegram.sendMessage(
      chatId,
      [
        '<b>Broadcast preview</b>',
        '',
        this.escape(text),
        '',
        ...(button
          ? [
              `Button: ${this.escape(button.text)}`,
              `URL: ${this.escape(button.url)}`,
              '',
            ]
          : []),
        `Recipients: ${recipientsCount}`,
      ].join('\n'),
      this.getBroadcastInlineButtonMarkup(button),
    );

    await this.telegram.sendMessage(
      chatId,
      `Tap ${BROADCAST_CONFIRM_BUTTON} to start or ${BROADCAST_CANCEL_BUTTON} to cancel.`,
      this.getBroadcastConfirmKeyboardMarkup(),
    );
  }

  private async runBroadcast(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
  ) {
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let offset = 0;
    const escapedText = this.escape(text);
    const replyMarkup = this.getBroadcastInlineButtonMarkup(button);

    try {
      while (true) {
        const users = await this.users.find({
          select: { telegramId: true },
          order: { createdAt: 'ASC' },
          skip: offset,
          take: BROADCAST_BATCH_SIZE,
        });

        if (users.length === 0) {
          break;
        }

        for (const user of users) {
          if (!user.telegramId) {
            skipped += 1;
            continue;
          }

          const response = (await this.mainTelegram.sendMessage(
            user.telegramId,
            escapedText,
            replyMarkup,
          )) as { ok: boolean };

          if (response.ok) {
            sent += 1;
          } else {
            failed += 1;
          }

          await this.sleep(BROADCAST_SEND_DELAY_MS);
        }

        offset += users.length;
      }

      await this.telegram.sendMessage(
        chatId,
        [
          '✅ <b>Broadcast finished</b>',
          '',
          `Sent: ${sent}`,
          `Failed: ${failed}`,
          `Skipped: ${skipped}`,
        ].join('\n'),
      );
    } finally {
      this.broadcastInProgress = false;
    }
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
      `<b>Open support requests:</b> ${requests.length}`,
    );

    await Promise.all(
      requests.map((request) =>
        this.sendSupportRequestMessage(chatId, request),
      ),
    );
  }

  private async resolveSupport(
    chatId: string | number,
    requestId?: string,
    messageId?: number,
  ) {
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

    if (messageId) {
      await this.telegram.editMessageReplyMarkup(chatId, messageId);
    }

    await this.telegram.sendMessage(
      chatId,
      [
        '✅ <b>Support request resolved</b>',
        '',
        `ID: <code>${this.escape(request.id)}</code>`,
        `User: ${this.formatUser(request.user)}`,
        `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
        `Topic: ${this.escape(request.topic)}`,
        ...(request.message
          ? ['', '<b>Message:</b>', this.escape(request.message)]
          : []),
      ].join('\n'),
    );
  }

  private async sendSupportRequestMessage(
    chatId: string | number,
    request: SupportRequest,
  ) {
    await this.telegram.sendMessage(
      chatId,
      this.formatSupportRequest(request),
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

  private formatSupportRequest(request: SupportRequest) {
    return [
      '💬 <b>Support request</b>',
      '',
      `${this.formatDate(request.createdAt)} - ${this.escape(request.topic)}`,
      `ID: <code>${this.escape(request.id)}</code>`,
      `User: ${this.formatUser(request.user)}`,
      `Telegram ID: <code>${this.escape(request.user.telegramId)}</code>`,
      ...(request.message
        ? ['', '<b>Message:</b>', this.escape(request.message)]
        : []),
      `Resolve: <code>/resolve_support ${this.escape(request.id)}</code>`,
    ].join('\n');
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

  private async findUserByUsername(username: string) {
    return this.users
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username })
      .getOne();
  }

  private normalizeUsername(value: string) {
    const username = value.trim().replace(/^@/, '');

    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      return null;
    }

    return username;
  }

  private normalizeBroadcastButtonUrl(value: string) {
    const text = value.trim();

    try {
      const url = new URL(text);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  private parseSubscriptionEndDate(value: string) {
    const text = value.trim();
    const isoMatch = text.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/,
    );
    const dotMatch = text.match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/,
    );

    if (isoMatch) {
      return this.buildDate(
        Number(isoMatch[1]),
        Number(isoMatch[2]),
        Number(isoMatch[3]),
        isoMatch[4] ? Number(isoMatch[4]) : 23,
        isoMatch[5] ? Number(isoMatch[5]) : 59,
        !isoMatch[4],
      );
    }

    if (dotMatch) {
      return this.buildDate(
        Number(dotMatch[3]),
        Number(dotMatch[2]),
        Number(dotMatch[1]),
        dotMatch[4] ? Number(dotMatch[4]) : 23,
        dotMatch[5] ? Number(dotMatch[5]) : 59,
        !dotMatch[4],
      );
    }

    return null;
  }

  private buildDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    endOfMinute: boolean,
  ) {
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    const date = new Date(
      year,
      month - 1,
      day,
      hour,
      minute,
      endOfMinute ? 59 : 0,
      endOfMinute ? 999 : 0,
    );

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      return null;
    }

    return date;
  }

  private formatUser(user: User) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const username = user.username ? `@${user.username}` : '';
    return this.escape([name, username].filter(Boolean).join(' ') || '-');
  }

  private getMarathonFlowButtonText(product: Product) {
    const flowNumber = this.getMarathonFlowNumber(product);

    if (Number.isFinite(flowNumber)) {
      return `Поток ${flowNumber}`;
    }

    return product.title;
  }

  private getMarathonFlowNumber(product: Product) {
    const match = product.slug.match(
      new RegExp(`^${MARATHON_PRODUCT_SLUG_PREFIX}(\\d+)$`),
    );

    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
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

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
