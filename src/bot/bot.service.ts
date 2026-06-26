import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '../common/enums';
import { PaymentService } from '../payments/payment.service';
import { ProductService } from '../products/product.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { SupportService } from '../support/support.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TelegramApiService } from '../notifications/telegram-api.service';
import {
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from './telegram.types';

const CALLBACKS = {
  theCycle: 'product:the-cycle',
  marathon: 'product:marathon',
  materials: 'product:materials',
  joinTheCycle: 'payment:join-the-cycle',
  insideTheCycle: 'product:the-cycle:inside',
  supportOpen: 'support:open',
};

const MOCK_PAYMENT_PREFIX = 'payment:mock-confirm:';

const SUPPORT_TOPICS: Record<string, string> = {
  'support:topic:payment': '💳 Проблема с оплатой',
  'support:topic:access': '📚 Нет доступа к продукту',
  'support:topic:club': '❓ Вопрос по клубу',
  'support:topic:technical': '⚙️ Техническая проблема',
  'support:topic:other': '📝 Другое',
};

@Injectable()
export class BotService {
  constructor(
    private readonly telegram: TelegramApiService,
    private readonly users: UserService,
    private readonly products: ProductService,
    private readonly subscriptions: SubscriptionService,
    private readonly payments: PaymentService,
    private readonly support: SupportService,
  ) {}

  async handleUpdate(update: TelegramUpdate) {
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  private async handleMessage(message: TelegramMessage) {
    if (!message.from || !message.text) {
      return;
    }

    const user = await this.users.upsertTelegramUser(message.from);
    const text = message.text.trim();

    if (text === '/start' || text === '🏠 На главную') {
      await this.sendWelcome(message.chat.id);
      return;
    }

    if (text === '📦 Мои подписки') {
      await this.sendSubscriptions(message.chat.id, user.id);
      return;
    }

    if (text === '💬 Саппорт') {
      await this.sendSupportTopics(message.chat.id);
      return;
    }

    await this.sendWelcome(message.chat.id);
  }

  private async handleCallback(callbackQuery: TelegramCallbackQuery) {
    const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id;
    const user = await this.users.upsertTelegramUser(callbackQuery.from);
    const data = callbackQuery.data;

    await this.telegram.answerCallbackQuery(callbackQuery.id);

    if (!data) {
      return;
    }

    if (data === CALLBACKS.theCycle) {
      await this.sendTheCycle(chatId, user.id);
      return;
    }

    if (data === CALLBACKS.marathon) {
      await this.telegram.sendMessage(
        chatId,
        '🔥 Марафон скоро будет доступен. Следите за обновлениями ❤️',
      );
      return;
    }

    if (data === CALLBACKS.materials) {
      await this.telegram.sendMessage(
        chatId,
        '📚 Матеріали скоро будут доступны. Следите за обновлениями ❤️',
      );
      return;
    }

    if (data === CALLBACKS.insideTheCycle) {
      await this.sendInsideTheCycle(chatId);
      return;
    }

    if (data === CALLBACKS.joinTheCycle) {
      await this.startTheCyclePayment(chatId, user);
      return;
    }

    if (data.startsWith(MOCK_PAYMENT_PREFIX)) {
      await this.confirmMockPayment(chatId, data.slice(MOCK_PAYMENT_PREFIX.length));
      return;
    }

    if (data === CALLBACKS.supportOpen) {
      await this.sendSupportTopics(chatId);
      return;
    }

    if (SUPPORT_TOPICS[data]) {
      await this.support.create(user, SUPPORT_TOPICS[data]);
      await this.telegram.sendMessage(
        chatId,
        'Спасибо. Мы получили ваше обращение и скоро свяжемся с вами ❤️',
      );
    }
  }

  private async sendWelcome(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      [
        'Добро пожаловать в женский клуб The Cycle ❤️',
        '',
        'Здесь эксперт помогает бережно разбираться в себе, цикле, состоянии и важных жизненных переходах.',
        '',
        'Выберите направление:',
      ].join('\n'),
      {
        inline_keyboard: [
          [{ text: '🌸 The Cycle', callback_data: CALLBACKS.theCycle }],
          [{ text: '🔥 Марафон', callback_data: CALLBACKS.marathon }],
          [{ text: '📚 Матеріали', callback_data: CALLBACKS.materials }],
        ],
      },
    );

    await this.sendReplyKeyboard(chatId);
  }

  private async sendReplyKeyboard(chatId: string | number) {
    await this.telegram.sendMessage(chatId, 'Основное меню доступно внизу.', {
      keyboard: [
        [{ text: '🏠 На главную' }],
        [{ text: '📦 Мои подписки' }, { text: '💬 Саппорт' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    });
  }

  private async sendTheCycle(chatId: string | number, userId: string) {
    const product = await this.products.getTheCycleProduct();
    const hasActiveSubscription =
      await this.subscriptions.hasActiveSubscription(userId, product.id);

    const inlineKeyboard = hasActiveSubscription
      ? [[{ text: '📖 Что внутри клуба', callback_data: CALLBACKS.insideTheCycle }]]
      : [
          [{ text: '✨ Присоединиться', callback_data: CALLBACKS.joinTheCycle }],
          [
            {
              text: '📖 Что внутри клуба',
              callback_data: CALLBACKS.insideTheCycle,
            },
          ],
        ];

    await this.telegram.sendMessage(
      chatId,
      [
        '🌸 <b>The Cycle</b>',
        '',
        'Клуб для женщин, которые хотят лучше понимать свое тело, цикл, эмоции и внутренние ритмы.',
        '',
        'Внутри: экспертные материалы, поддержка, практики, эфиры и бережное сообщество.',
        '',
        'Подходит, если вы хотите регулярную опору, больше ясности и мягкое движение к себе.',
      ].join('\n'),
      { inline_keyboard: inlineKeyboard },
    );
  }

  private async sendInsideTheCycle(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      [
        '📖 <b>Что внутри клуба</b>',
        '',
        '• тематические материалы по циклу и состоянию',
        '• практики для самонаблюдения и восстановления',
        '• эфиры и ответы эксперта',
        '• закрытое пространство поддержки',
        '• обновления и новые материалы в течение подписки',
      ].join('\n'),
    );
  }

  private async startTheCyclePayment(chatId: string | number, user: User) {
    const product = await this.products.getTheCycleProduct();

    const hasActiveSubscription =
      await this.subscriptions.hasActiveSubscription(user.id, product.id);

    if (hasActiveSubscription) {
      await this.telegram.sendMessage(chatId, 'У вас уже есть активная подписка.');
      await this.sendTheCycle(chatId, user.id);
      return;
    }

    const paymentAttempt = await this.payments.createWayForPayAttempt(
      user,
      product,
    );

    const paymentButton =
      paymentAttempt.provider === PaymentProvider.Mock
        ? {
            text: '💳 Подтвердить тестовую оплату',
            callback_data: `${MOCK_PAYMENT_PREFIX}${paymentAttempt.id}`,
          }
        : { text: '💳 Оплатить', url: paymentAttempt.paymentUrl };

    await this.telegram.sendMessage(
      chatId,
      [
        '✨ Для присоединения к The Cycle завершите оплату.',
        '',
        `Сумма: ${paymentAttempt.amount} ${paymentAttempt.currency}`,
      ].join('\n'),
      {
        inline_keyboard: [
          [paymentButton],
          [{ text: '💬 Саппорт', callback_data: CALLBACKS.supportOpen }],
        ],
      },
    );
  }

  private async confirmMockPayment(chatId: string | number, paymentAttemptId: string) {
    await this.payments.confirmMockPaymentAttempt(paymentAttemptId);
    await this.telegram.sendMessage(
      chatId,
      '✅ Тестовая оплата подтверждена. Подписка активирована.',
    );
  }

  private async sendSubscriptions(chatId: string | number, userId: string) {
    const subscriptions = await this.subscriptions.listActiveForUser(userId);

    if (subscriptions.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        'У вас пока нет активных подписок.',
      );
      return;
    }

    const lines = subscriptions.flatMap((subscription) => [
      `• ${subscription.product.title}`,
      subscription.expiresAt
        ? `  Активна до: ${subscription.expiresAt.toLocaleDateString('ru-RU')}`
        : '  Активна без даты окончания',
    ]);

    await this.telegram.sendMessage(
      chatId,
      ['📦 <b>Мои подписки</b>', '', ...lines].join('\n'),
    );
  }

  private async sendSupportTopics(chatId: string | number) {
    await this.telegram.sendMessage(chatId, 'Выберите тему обращения:', {
      inline_keyboard: [
        [{ text: '💳 Проблема с оплатой', callback_data: 'support:topic:payment' }],
        [
          {
            text: '📚 Нет доступа к продукту',
            callback_data: 'support:topic:access',
          },
        ],
        [{ text: '❓ Вопрос по клубу', callback_data: 'support:topic:club' }],
        [
          {
            text: '⚙️ Техническая проблема',
            callback_data: 'support:topic:technical',
          },
        ],
        [{ text: '📝 Другое', callback_data: 'support:topic:other' }],
      ],
    });
  }
}
