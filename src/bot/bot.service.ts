import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { PaymentProvider, ProductType } from '../common/enums';
import { PaymentService } from '../payments/payment.service';
import { Product } from '../products/product.entity';
import { ProductService } from '../products/product.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { SupportService } from '../support/support.service';
import { UserActivityService } from '../user-activity/user-activity.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { BotFlowService, SUPPORT_OPEN_CALLBACK } from './bot-flow.service';
import { FlowScreen } from './bot-flow.types';
import {
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
} from './telegram.types';

const MOCK_PAYMENT_PREFIX = 'payment:mock-confirm:';
const LEGACY_CALLBACKS = {
  theCycle: 'product:the-cycle',
  marathon: 'product:marathon',
  materials: 'product:materials',
  joinTheCycle: 'payment:join-the-cycle',
  insideTheCycle: 'product:the-cycle:inside',
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
    private readonly activity: UserActivityService,
    private readonly flow: BotFlowService,
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
    await this.activity.track(user, 'message', 'message_received', {
      chatId: message.chat.id,
      messageId: message.message_id,
      text,
    });

    if (text === '/start' || text === '🏠 На главную') {
      await this.sendStartScreen(message.chat.id, user.id);
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

    await this.sendStartScreen(message.chat.id, user.id);
  }

  private async handleCallback(callbackQuery: TelegramCallbackQuery) {
    const chatId = callbackQuery.message?.chat.id ?? callbackQuery.from.id;
    const user = await this.users.upsertTelegramUser(callbackQuery.from);
    const data = callbackQuery.data;

    await this.telegram.answerCallbackQuery(callbackQuery.id);

    if (!data) {
      return;
    }

    await this.activity.track(user, 'callback', data, {
      chatId,
      messageId: callbackQuery.message?.message_id,
    });

    if (data === LEGACY_CALLBACKS.theCycle) {
      await this.sendFlowScreen(chatId, user.id, 'the-cycle');
      return;
    }

    if (data === LEGACY_CALLBACKS.marathon) {
      await this.sendFlowScreen(chatId, user.id, 'marathon');
      return;
    }

    if (data === LEGACY_CALLBACKS.materials) {
      await this.sendFlowScreen(chatId, user.id, 'materials');
      return;
    }

    if (data === LEGACY_CALLBACKS.insideTheCycle) {
      await this.sendFlowScreen(chatId, user.id, 'the-cycle-inside');
      return;
    }

    if (data === LEGACY_CALLBACKS.joinTheCycle) {
      await this.startProductPayment(chatId, user, 'the-cycle');
      return;
    }

    const flowScreenId = this.flow.getFlowScreenIdFromCallback(data);
    if (flowScreenId) {
      await this.sendFlowScreen(chatId, user.id, flowScreenId);
      return;
    }

    const paymentProductSlug =
      this.flow.getPaymentProductSlugFromCallback(data);
    if (paymentProductSlug) {
      await this.startProductPayment(chatId, user, paymentProductSlug);
      return;
    }

    if (data.startsWith(MOCK_PAYMENT_PREFIX)) {
      await this.confirmMockPayment(
        chatId,
        data.slice(MOCK_PAYMENT_PREFIX.length),
      );
      return;
    }

    if (data === SUPPORT_OPEN_CALLBACK) {
      await this.sendSupportTopics(chatId);
      return;
    }

    const supportTopic = this.flow.getSupportTopicByCallback(data);
    if (supportTopic) {
      await this.support.create(user, supportTopic.requestTopic);
      await this.telegram.sendMessage(
        chatId,
        this.flow.getSupportSuccessMessage(),
      );
    }
  }

  private async sendStartScreen(chatId: string | number, userId: string) {
    await this.sendFlowScreen(chatId, userId, this.flow.getStartScreenId());
    await this.sendReplyKeyboard(chatId);
  }

  private async sendFlowScreen(
    chatId: string | number,
    userId: string,
    screenId: string,
  ) {
    const screen = this.flow.getScreen(screenId);
    const context = await this.buildFlowScreenContext(screen, userId);
    const inlineKeyboard = this.flow.buildScreenInlineKeyboard(
      screenId,
      context,
    );
    const replyMarkup = inlineKeyboard
      ? { inline_keyboard: inlineKeyboard }
      : undefined;

    if (!screen.photoFile) {
      await this.telegram.sendMessage(
        chatId,
        this.flow.getScreenText(screenId),
        replyMarkup,
      );
      return;
    }

    await this.telegram.sendMessage(chatId, this.flow.getScreenText(screenId));

    const photo = this.resolveFlowPhotoFile(screen.photoFile);
    if (!photo) {
      await this.telegram.sendMessage(
        chatId,
        'Фото не найдено. Выберите действие:',
        replyMarkup,
      );
      return;
    }

    const photoResponse = await this.telegram.sendPhotoFile(
      chatId,
      photo.path,
      photo.filename,
      replyMarkup,
    );

    if (!photoResponse.ok && replyMarkup) {
      await this.telegram.sendMessage(chatId, 'Выберите действие:', replyMarkup);
    }
  }

  private resolveFlowPhotoFile(photoFile: string) {
    const filename = basename(photoFile);

    if (filename !== photoFile) {
      return null;
    }

    const path = join(process.cwd(), 'files', filename);

    if (!existsSync(path)) {
      return null;
    }

    return { path, filename };
  }

  private async buildFlowScreenContext(screen: FlowScreen, userId: string) {
    const productSlugs = this.getFlowScreenProductSlugs(screen);
    const activeProductsBySlug = await this.getActiveProductsBySlug(
      productSlugs,
    );
    const productsBySlug =
      this.buildFlowScreenProductValues(activeProductsBySlug);

    if (!screen.productSlug) {
      return { productsBySlug };
    }

    const product = activeProductsBySlug[screen.productSlug];
    const hasActiveSubscription =
      await this.subscriptions.hasActiveSubscription(userId, product.id);

    return { hasActiveSubscription, productsBySlug };
  }

  private getFlowScreenProductSlugs(screen: FlowScreen): string[] {
    const productSlugs = new Set<string>();

    if (screen.productSlug) {
      productSlugs.add(screen.productSlug);
    }

    for (const row of screen.buttons ?? []) {
      for (const button of row) {
        if (button.action === 'startPayment' && button.productSlug) {
          productSlugs.add(button.productSlug);
        }
      }
    }

    return [...productSlugs];
  }

  private async getActiveProductsBySlug(
    productSlugs: string[],
  ): Promise<Record<string, Product>> {
    const products = await Promise.all(
      productSlugs.map((slug) => this.products.getActiveProductBySlug(slug)),
    );

    return Object.fromEntries(
      products.map((product) => [product.slug, product]),
    );
  }

  private buildFlowScreenProductValues(
    productsBySlug: Record<string, Product>,
  ) {
    return Object.fromEntries(
      Object.entries(productsBySlug).map(([slug, product]) => [
        slug,
        {
          price: product.price,
          currency: product.currency,
        },
      ]),
    );
  }

  private async sendReplyKeyboard(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      this.flow.getReplyKeyboardMessage(),
      this.flow.buildReplyKeyboard(),
    );
  }

  private async startProductPayment(
    chatId: string | number,
    user: User,
    productSlug: string,
  ) {
    const product = await this.products.getActiveProductBySlug(productSlug);

    const hasActiveSubscription =
      await this.subscriptions.hasActiveSubscription(user.id, product.id);

    const paymentAttempt = await this.payments.createWayForPayAttempt(
      user,
      product,
    );
    await this.activity.track(user, 'payment', 'payment_attempt_created', {
      paymentAttemptId: paymentAttempt.id,
      provider: paymentAttempt.provider,
      amount: paymentAttempt.amount,
      currency: paymentAttempt.currency,
      productId: product.id,
      productSlug: product.slug,
    });

    const isMockPayment = paymentAttempt.provider === PaymentProvider.Mock;
    const paymentButton = isMockPayment
      ? {
          text: this.flow.getPaymentButtonText(true),
          callback_data: `${MOCK_PAYMENT_PREFIX}${paymentAttempt.id}`,
        }
      : {
          text: this.flow.getPaymentButtonText(false),
          url: paymentAttempt.paymentUrl,
        };

    await this.telegram.sendMessage(
      chatId,
      [
        this.flow.buildPaymentIntro(
          hasActiveSubscription,
          {
            productTitle: product.title,
          },
          product.type === ProductType.Subscription,
        ),
        '',
        this.flow.buildPaymentAmountLine({
          amount: paymentAttempt.amount,
          currency: paymentAttempt.currency,
        }),
      ].join('\n'),
      {
        inline_keyboard: [
          [paymentButton],
          [
            {
              text: this.flow.getSupportOpenButtonText(),
              callback_data: SUPPORT_OPEN_CALLBACK,
            },
          ],
        ],
      },
    );
  }

  private async confirmMockPayment(
    chatId: string | number,
    paymentAttemptId: string,
  ) {
    await this.payments.confirmMockPaymentAttempt(paymentAttemptId);
    const paymentAttempt = await this.payments.findById(paymentAttemptId);
    await this.activity.track(
      paymentAttempt.user,
      'payment',
      'mock_payment_confirmed',
      {
        paymentAttemptId,
      },
    );
    await this.telegram.sendMessage(
      chatId,
      this.flow.getMockPaymentSuccessMessage(
        paymentAttempt.product.type === ProductType.Subscription,
      ),
    );
  }

  private async sendSubscriptions(chatId: string | number, userId: string) {
    const subscriptions = await this.subscriptions.listActiveForUser(userId);

    if (subscriptions.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        this.flow.getEmptySubscriptionsMessage(),
      );
      return;
    }

    const lines = subscriptions.map((subscription) =>
      this.flow.getActiveSubscriptionMessage({
        productTitle: subscription.product.title,
        date: this.formatSubscriptionDate(subscription.expiresAt),
      }),
    );

    await this.telegram.sendMessage(
      chatId,
      [this.flow.getSubscriptionsTitle(), '', ...lines].join('\n'),
    );
  }

  private async sendSupportTopics(chatId: string | number) {
    await this.telegram.sendMessage(chatId, this.flow.getSupportPrompt(), {
      inline_keyboard: this.flow.buildSupportTopicsInlineKeyboard(),
    });
  }

  private formatSubscriptionDate(expiresAt?: Date | null) {
    if (!expiresAt) {
      return this.flow.getSubscriptionNoExpirationMessage();
    }

    return expiresAt.toLocaleDateString('ru-RU');
  }
}
