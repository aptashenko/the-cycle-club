import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { AttributionService } from '../attribution/attribution.service';
import { PaymentProvider, ProductType } from '../common/enums';
import { LiveEventsService } from '../live-events/live-events.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { Product } from '../products/product.entity';
import {
  ProductService,
  THE_CYCLE_SLUG,
  THE_CYCLE_TODAY_OFFER_SLUG,
} from '../products/product.service';
import {
  isTheCycleTodayOfferAvailable,
  THE_CYCLE_TODAY_OFFER_START_PAYLOAD,
  THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE,
} from '../products/the-cycle-today-offer';
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
const TELEGRAM_PHOTO_CAPTION_LIMIT = 1024;
const LEGACY_CALLBACKS = {
  theCycle: 'product:the-cycle',
  marathon: 'product:marathon',
  materials: 'product:materials',
  joinTheCycle: 'payment:join-the-cycle',
  insideTheCycle: 'product:the-cycle:inside',
};

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly pendingSupportMessages = new Map<string, string>();
  private readonly pendingConsultationPayments = new Map<string, string>();

  constructor(
    private readonly telegram: TelegramApiService,
    private readonly users: UserService,
    private readonly products: ProductService,
    private readonly subscriptions: SubscriptionService,
    private readonly payments: PaymentService,
    private readonly notifications: NotificationService,
    private readonly support: SupportService,
    private readonly liveEvents: LiveEventsService,
    private readonly activity: UserActivityService,
    private readonly attribution: AttributionService,
    private readonly flow: BotFlowService,
    private readonly config: ConfigService,
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
    this.logger.log(
      `Telegram message chat id=${message.chat.id}, type=${message.chat.type}, title=${message.chat.title ?? ''}`,
    );

    if (!message.from) {
      return;
    }

    if (message.chat.type !== 'private') {
      return;
    }

    const user = await this.users.upsertTelegramUser(message.from);

    if (message.contact) {
      await this.handleContactMessage(message, user);
      return;
    }

    if (!message.text) {
      return;
    }

    const text = message.text.trim();
    const isStartCommand = this.isStartCommand(text);
    const startPayload = this.extractStartPayload(text);
    await this.activity.track(user, 'message', 'message_received', {
      chatId: message.chat.id,
      messageId: message.message_id,
      text,
    });

    if (isStartCommand || text === '\uD83D\uDE80 В начало') {
      if (startPayload === THE_CYCLE_TODAY_OFFER_START_PAYLOAD) {
        this.pendingSupportMessages.delete(user.id);
        this.pendingConsultationPayments.delete(user.id);

        if (!isTheCycleTodayOfferAvailable()) {
          await this.telegram.sendMessage(
            message.chat.id,
            THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE,
          );
          return;
        }

        await this.sendFlowScreen(
          message.chat.id,
          user.id,
          THE_CYCLE_TODAY_OFFER_SLUG,
        );
        return;
      }

      if (startPayload) {
        await this.attribution.attachTelegramUser(startPayload, user);
      }

      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendStartScreen(message.chat.id, user.id);
      return;
    }

    if (text === '\uD83D\uDC8C Мои подписки') {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendSubscriptions(message.chat.id, user.id);
      return;
    }

    if (text === '🫂 Поддержка') {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendSupportTopics(message.chat.id);
      return;
    }

    if (this.isKeywordResponseMessage(text)) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendKeywordResponse(message.chat.id);
      return;
    }

    const pendingSupportTopic = this.pendingSupportMessages.get(user.id);
    if (pendingSupportTopic) {
      if (!text) {
        await this.telegram.sendMessage(
          message.chat.id,
          this.flow.getSupportMessagePrompt(),
        );
        return;
      }

      this.pendingSupportMessages.delete(user.id);
      await this.support.create(user, pendingSupportTopic, text);
      await this.telegram.sendMessage(
        message.chat.id,
        this.flow.getSupportSuccessMessage(),
      );
      return;
    }

    const pendingConsultationProductSlug = this.pendingConsultationPayments.get(
      user.id,
    );
    if (pendingConsultationProductSlug) {
      await this.sendPhoneNumberRequest(message.chat.id);
      return;
    }

    await this.sendStartScreen(message.chat.id, user.id);
  }

  private isStartCommand(text: string): boolean {
    return /^\/start(?:@\w+)?(?:\s|$)/.test(text);
  }

  private async handleContactMessage(message: TelegramMessage, user: User) {
    if (!message.contact) {
      return;
    }

    const updatedUser = await this.users.updatePhoneNumber(
      user.id,
      message.contact.phone_number,
    );
    const pendingProductSlug = this.pendingConsultationPayments.get(user.id);
    this.pendingConsultationPayments.delete(user.id);

    await this.activity.track(updatedUser, 'message', 'contact_received', {
      chatId: message.chat.id,
      messageId: message.message_id,
      phoneUserId: message.contact.user_id,
    });

    await this.telegram.sendMessage(
      message.chat.id,
      'Спасибо, номер телефона сохранён.',
      this.flow.buildReplyKeyboard(),
    );

    if (pendingProductSlug) {
      await this.startProductPayment(
        message.chat.id,
        updatedUser,
        pendingProductSlug,
      );
      return;
    }

    await this.sendReplyKeyboard(message.chat.id);
  }

  private extractStartPayload(text: string): string | undefined {
    const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})$/);
    return match?.[1];
  }

  private isKeywordResponseMessage(text: string): boolean {
    const keyword = this.config.get<string>('KEYWORD_RESPONSE_WORD', '').trim();

    return (
      keyword.length > 0 &&
      text.localeCompare(keyword, undefined, { sensitivity: 'accent' }) === 0
    );
  }

  private async sendKeywordResponse(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      this.flow.getKeywordResponseMessage(),
    );

    for (const documentFile of this.flow.getKeywordResponseDocumentFiles()) {
      const document = this.resolveFlowDocumentFile(documentFile);

      if (!document) {
        this.logger.warn(
          `Keyword response document not found: ${documentFile}`,
        );
        continue;
      }

      await this.telegram.sendDocumentFile(
        chatId,
        document.path,
        document.filename,
      );
    }
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
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendFlowScreen(chatId, user.id, 'the-cycle');
      return;
    }

    if (data === LEGACY_CALLBACKS.marathon) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendFlowScreen(chatId, user.id, 'marathon');
      return;
    }

    if (data === LEGACY_CALLBACKS.materials) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendFlowScreen(chatId, user.id, 'materials');
      return;
    }

    if (data === LEGACY_CALLBACKS.insideTheCycle) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendFlowScreen(chatId, user.id, 'the-cycle-inside');
      return;
    }

    if (data === LEGACY_CALLBACKS.joinTheCycle) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendTheCyclePaymentDisabledMessage(chatId);
      // The Cycle payment flow is disabled.
      // await this.startProductPayment(chatId, user, 'the-cycle');
      return;
    }

    const flowScreenId = this.flow.getFlowScreenIdFromCallback(data);
    if (flowScreenId) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendFlowScreen(chatId, user.id, flowScreenId);
      return;
    }

    const paymentProductSlug =
      this.flow.getPaymentProductSlugFromCallback(data);
    if (paymentProductSlug) {
      this.pendingSupportMessages.delete(user.id);
      if (paymentProductSlug === THE_CYCLE_SLUG) {
        await this.sendTheCyclePaymentDisabledMessage(chatId);
        return;
      }
      await this.startProductPayment(chatId, user, paymentProductSlug);
      return;
    }

    const liveEventSlug = this.flow.getLiveEventSlugFromCallback(data);
    if (liveEventSlug) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.registerLiveEvent(chatId, user, liveEventSlug);
      return;
    }

    if (data.startsWith(MOCK_PAYMENT_PREFIX)) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.confirmMockPayment(
        chatId,
        data.slice(MOCK_PAYMENT_PREFIX.length),
      );
      return;
    }

    if (data === SUPPORT_OPEN_CALLBACK) {
      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
      await this.sendSupportTopics(chatId);
      return;
    }

    const supportTopic = this.flow.getSupportTopicByCallback(data);
    if (supportTopic) {
      if (supportTopic.requiresMessage) {
        this.pendingSupportMessages.set(user.id, supportTopic.requestTopic);
        await this.telegram.sendMessage(
          chatId,
          this.flow.getSupportMessagePrompt(),
        );
        return;
      }

      this.pendingSupportMessages.delete(user.id);
      this.pendingConsultationPayments.delete(user.id);
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

    const photoFiles = this.getFlowPhotoFiles(screen);

    if (photoFiles.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        this.flow.getScreenText(screenId),
        replyMarkup,
      );
      return;
    }

    const text = this.flow.getScreenText(screenId);

    const photos = photoFiles
      .map((photoFile) => this.resolveFlowPhotoFile(photoFile))
      .filter((photo) => photo !== null);

    if (photos.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        'Фото не найдено. Выберите действие:',
        replyMarkup,
      );
      return;
    }

    if (photos.length > 1) {
      await this.telegram.sendMessage(chatId, text);
      await this.telegram.sendPhotoMediaGroup(chatId, photos);

      if (replyMarkup) {
        await this.telegram.sendMessage(
          chatId,
          'Выберите действие:',
          replyMarkup,
        );
      }

      return;
    }

    if (text.length <= TELEGRAM_PHOTO_CAPTION_LIMIT) {
      await this.sendPhotosWithCaption(chatId, photos, text, replyMarkup);
      return;
    }

    await this.telegram.sendMessage(chatId, text);

    for (const [index, photo] of photos.entries()) {
      const isLastPhoto = index === photos.length - 1;
      const photoResponse = await this.telegram.sendPhotoFile(
        chatId,
        photo.path,
        photo.filename,
        isLastPhoto ? replyMarkup : undefined,
      );

      if (!photoResponse.ok && isLastPhoto && replyMarkup) {
        await this.telegram.sendMessage(
          chatId,
          'Выберите действие:',
          replyMarkup,
        );
      }
    }
  }

  private async sendPhotosWithCaption(
    chatId: string | number,
    photos: { path: string; filename: string }[],
    caption: string,
    replyMarkup?: Record<string, unknown>,
  ) {
    if (photos.length === 1) {
      const photoResponse = await this.telegram.sendPhotoFile(
        chatId,
        photos[0].path,
        photos[0].filename,
        replyMarkup,
        caption,
      );

      if (!photoResponse.ok && replyMarkup) {
        await this.telegram.sendMessage(
          chatId,
          'Выберите действие:',
          replyMarkup,
        );
      }

      return;
    }

    await this.telegram.sendPhotoMediaGroup(chatId, photos, caption);

    if (replyMarkup) {
      await this.telegram.sendMessage(
        chatId,
        'Выберите действие:',
        replyMarkup,
      );
    }
  }

  private getFlowPhotoFiles(screen: FlowScreen): string[] {
    return [screen.photoFile, ...(screen.photoFiles ?? [])].filter(
      (photoFile): photoFile is string => Boolean(photoFile),
    );
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

  private resolveFlowDocumentFile(documentFile: string) {
    const filename = basename(documentFile);

    if (filename !== documentFile) {
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
    const activeProductsBySlug =
      await this.getActiveProductsBySlug(productSlugs);
    const productsBySlug =
      this.buildFlowScreenProductValues(activeProductsBySlug);

    const accessProductSlug =
      screen.productSlug ??
      (productSlugs.length === 1 ? productSlugs[0] : null);

    if (!accessProductSlug) {
      return { productsBySlug };
    }

    const product = activeProductsBySlug[accessProductSlug];
    const hasActiveSubscription = await this.hasActiveSubscriptionForProduct(
      userId,
      product,
    );

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

  private async registerLiveEvent(
    chatId: string | number,
    user: User,
    eventSlug: string,
  ) {
    const { registration, created } = await this.liveEvents.register(
      user,
      eventSlug,
    );

    await this.activity.track(
      user,
      'live_event',
      created ? 'live_event_registered' : 'live_event_already_registered',
      {
        registrationId: registration.id,
        eventSlug,
      },
    );

    await this.telegram.sendMessage(
      chatId,
      this.flow.getLiveEventRegistrationMessage(eventSlug, created),
      {
        inline_keyboard: this.flow.buildLiveEventLinkInlineKeyboard(eventSlug),
      },
    );
  }

  private async startProductPayment(
    chatId: string | number,
    user: User,
    productSlug: string,
  ) {
    if (
      productSlug === THE_CYCLE_TODAY_OFFER_SLUG &&
      !isTheCycleTodayOfferAvailable()
    ) {
      await this.telegram.sendMessage(
        chatId,
        THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE,
      );
      return;
    }

    if (productSlug === THE_CYCLE_SLUG) {
      await this.sendTheCyclePaymentDisabledMessage(chatId);
      return;
    }

    const product = await this.products.getActiveProductBySlug(productSlug);

    if (this.requiresPhoneNumberBeforePayment(product) && !user.phoneNumber) {
      this.pendingConsultationPayments.set(user.id, product.slug);
      await this.sendPhoneNumberRequest(chatId);
      return;
    }

    const hasActiveSubscription = await this.hasActiveSubscriptionForProduct(
      user.id,
      product,
    );

    if (this.canOpenProductBySubscription(product, hasActiveSubscription)) {
      await this.notifications.notifyProductAccessBySubscription(user, product);
      await this.activity.track(user, 'product', 'opened_by_subscription', {
        productId: product.id,
        productSlug: product.slug,
      });
      return;
    }

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

  private async sendTheCyclePaymentDisabledMessage(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      'Оплата The Cycle сейчас недоступна.',
    );
  }

  private requiresPhoneNumberBeforePayment(product: Product): boolean {
    return product.slug.startsWith('consultation-format-');
  }

  private async sendPhoneNumberRequest(chatId: string | number) {
    await this.telegram.sendMessage(
      chatId,
      'Чтобы оформить консультацию, поделитесь, пожалуйста, номером телефона.',
      {
        keyboard: [
          [
            {
              text: 'Поделиться номером телефона',
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    );
  }

  private async hasActiveSubscriptionForProduct(
    userId: string,
    product: Product,
  ) {
    if (
      product.slug === THE_CYCLE_SLUG ||
      product.slug === THE_CYCLE_TODAY_OFFER_SLUG ||
      product.includedInSubscription
    ) {
      return this.hasActiveTheCycleSubscription(userId);
    }

    const subscriptionProduct =
      product.type === ProductType.Subscription ? product : null;

    if (!subscriptionProduct) {
      return false;
    }

    return this.subscriptions.hasActiveSubscription(
      userId,
      subscriptionProduct.id,
    );
  }

  private async hasActiveTheCycleSubscription(userId: string) {
    const subscriptionProducts = await Promise.all([
      this.products.getActiveProductBySlug(THE_CYCLE_SLUG),
      this.products.getActiveProductBySlug(THE_CYCLE_TODAY_OFFER_SLUG),
    ]);

    for (const subscriptionProduct of subscriptionProducts) {
      const hasActiveSubscription =
        await this.subscriptions.hasActiveSubscription(
          userId,
          subscriptionProduct.id,
        );

      if (hasActiveSubscription) {
        return true;
      }
    }

    return false;
  }

  private canOpenProductBySubscription(
    product: Product,
    hasActiveSubscription: boolean,
  ) {
    return (
      product.type !== ProductType.Subscription &&
      product.includedInSubscription &&
      hasActiveSubscription
    );
  }

  private async confirmMockPayment(
    chatId: string | number,
    paymentAttemptId: string,
  ) {
    const paymentAttempt = await this.payments.findById(paymentAttemptId);

    if (
      paymentAttempt.product.slug === THE_CYCLE_TODAY_OFFER_SLUG &&
      !isTheCycleTodayOfferAvailable()
    ) {
      await this.telegram.sendMessage(
        chatId,
        THE_CYCLE_TODAY_OFFER_UNAVAILABLE_MESSAGE,
      );
      return;
    }

    await this.payments.confirmMockPaymentAttempt(paymentAttemptId);
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
