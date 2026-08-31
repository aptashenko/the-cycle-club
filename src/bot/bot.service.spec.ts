import { ConfigService } from '@nestjs/config';
import { PaymentProvider, ProductType } from '../common/enums';
import { AttributionService } from '../attribution/attribution.service';
import { LiveEventsService } from '../live-events/live-events.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { Product } from '../products/product.entity';
import { ProductService } from '../products/product.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { SupportService } from '../support/support.service';
import { UserActivityService } from '../user-activity/user-activity.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TelegramApiService } from '../notifications/telegram-api.service';
import * as TheCycleTodayOffer from '../products/the-cycle-today-offer';
import { BotFlowService } from './bot-flow.service';
import { BotService } from './bot.service';

describe('BotService support flow', () => {
  const user = {
    id: 'user-id',
    telegramId: '123456',
  } as User;

  const buildService = (env: Record<string, string> = {}) => {
    const telegram = {
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendPhotoFile: jest.fn().mockResolvedValue({ ok: true }),
      sendPhotoMediaGroup: jest.fn().mockResolvedValue(undefined),
      sendDocumentFile: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<TelegramApiService>;
    const users = {
      upsertTelegramUser: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<UserService>;
    const support = {
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SupportService>;
    const liveEvents = {
      register: jest.fn().mockResolvedValue({
        registration: { id: 'registration-id' },
        created: true,
      }),
    } as unknown as jest.Mocked<LiveEventsService>;
    const activity = {
      track: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserActivityService>;
    const attribution = {
      attachTelegramUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AttributionService>;
    const notifications = {
      notifyProductAccessBySubscription: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    const products = {
      getActiveProductBySlug: jest.fn().mockResolvedValue({
        id: 'the-cycle-today-offer-id',
        slug: 'the-cycle-today-offer',
        title: 'The Cycle',
        price: '1499.00',
        currency: 'UAH',
        type: ProductType.Subscription,
        downloadFiles: [],
        includedInSubscription: false,
        isActive: true,
      } as unknown as Product),
    } as unknown as jest.Mocked<ProductService>;
    const subscriptions = {
      hasActiveSubscription: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<SubscriptionService>;
    const payments = {
      createWayForPayAttempt: jest.fn().mockResolvedValue({
        id: 'payment-attempt-id',
        provider: PaymentProvider.WayForPay,
        amount: '1499.00',
        currency: 'UAH',
        paymentUrl: 'https://example.test/checkout',
      }),
    } as unknown as jest.Mocked<PaymentService>;
    const flow = new BotFlowService();
    const config = {
      get: jest.fn(
        (key: string, defaultValue?: string) => env[key] ?? defaultValue,
      ),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new BotService(
      telegram,
      users,
      products,
      subscriptions,
      payments,
      notifications,
      support,
      liveEvents,
      activity,
      attribution,
      flow,
      config,
    );

    return {
      service,
      telegram,
      support,
      liveEvents,
      activity,
      notifications,
      attribution,
      products,
      subscriptions,
      payments,
      flow,
      config,
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('attaches telegram attribution from start payload', async () => {
    const { service, attribution } = buildService();

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: '/start abc123_X-y',
      },
    });

    expect(attribution.attachTelegramUser).toHaveBeenCalledWith(
      'abc123_X-y',
      user,
    );
  });

  it('opens special The Cycle scenario from start payload', async () => {
    jest
      .spyOn(TheCycleTodayOffer, 'isTheCycleTodayOfferAvailable')
      .mockReturnValue(true);

    const { service, telegram, attribution } = buildService();

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: '/start the_cycle_today',
      },
    });

    expect(attribution.attachTelegramUser).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      expect.stringContaining('Ссылка на оплату будет действительна'),
      expect.objectContaining({
        inline_keyboard: [
          [
            {
              text: 'Оплатить 1499 грн',
              callback_data: 'payment:start:the-cycle-today-offer',
            },
          ],
        ],
      }),
    );
    expect(telegram.sendMessage).not.toHaveBeenCalledWith(
      123456,
      'Основное меню доступно внизу ❤️',
      expect.anything(),
    );
  });

  it('does not open special The Cycle scenario after the first day', async () => {
    jest
      .spyOn(TheCycleTodayOffer, 'isTheCycleTodayOfferAvailable')
      .mockReturnValue(false);

    const { service, telegram, attribution } = buildService();

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: '/start the_cycle_today',
      },
    });

    expect(attribution.attachTelegramUser).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      'Ссылка будет доступна через месяц.',
    );
    expect(telegram.sendMessage).not.toHaveBeenCalledWith(
      123456,
      'Основное меню доступно внизу ❤️',
      expect.anything(),
    );
  });

  it('ignores messages from group chats', async () => {
    const { service, telegram, activity } = buildService();

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: -100123456, type: 'supergroup', title: 'Closed chat' },
        text: 'Любое сообщение в закрытом чате',
      },
    });

    expect(activity.track).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('asks for a message after selecting other support topic', async () => {
    const { service, telegram, support, flow } = buildService();

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'support:topic:other',
      },
    });

    expect(support.create).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      flow.getSupportMessagePrompt(),
    );

    await service.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: 'Нужно уточнить детали по клубу',
      },
    });

    expect(support.create).toHaveBeenCalledWith(
      user,
      '📝 Другое',
      'Нужно уточнить детали по клубу',
    );
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      flow.getSupportSuccessMessage(),
    );
  });

  it('creates regular support topics immediately', async () => {
    const { service, telegram, support, flow } = buildService();

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'support:topic:payment',
      },
    });

    expect(support.create).toHaveBeenCalledWith(user, '💳 Проблема с оплатой');
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      flow.getSupportSuccessMessage(),
    );
  });

  it('sends configured keyword response when env keyword matches', async () => {
    const { service, telegram, flow } = buildService({
      KEYWORD_RESPONSE_WORD: 'special',
    });

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: 'special',
      },
    });

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      flow.getKeywordResponseMessage(),
    );
    expect(telegram.sendDocumentFile).toHaveBeenCalledWith(
      123456,
      expect.stringContaining('files/sekrety_biohaking.pdf'),
      'sekrety_biohaking.pdf',
    );
  });

  it('does not handle keyword response when env keyword is empty', async () => {
    const { service, telegram, flow } = buildService();

    await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        text: 'special',
      },
    });

    expect(telegram.sendMessage).not.toHaveBeenCalledWith(
      123456,
      flow.getKeywordResponseMessage(),
    );
  });

  it('registers user for free live event from callback', async () => {
    const { service, telegram, liveEvents, activity } = buildService();

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'live-event:register:webinar1',
      },
    });

    expect(liveEvents.register).toHaveBeenCalledWith(user, 'webinar1');
    expect(activity.track).toHaveBeenCalledWith(
      user,
      'live_event',
      'live_event_registered',
      {
        registrationId: 'registration-id',
        eventSlug: 'webinar1',
      },
    );
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      expect.stringContaining('Вы записаны'),
      {
        inline_keyboard: [
          [
            {
              text: 'Перейти в Telegram',
              url: 'https://t.me/+S2XB1Sq_collZjRi',
            },
          ],
        ],
      },
    );
  });

  it('requests phone number before consultation payment and continues after contact', async () => {
    const consultation = {
      id: 'consultation-format-1-id',
      slug: 'consultation-format-1',
      title: 'EXPRESS | 100 €',
      description: 'Consultation',
      price: '1000.00',
      currency: 'UAH',
      type: ProductType.OneTime,
      downloadFiles: [],
      includedInSubscription: false,
      isActive: true,
    } as unknown as Product;
    const userWithoutPhone = { ...user, phoneNumber: null } as User;
    const userWithPhone = { ...user, phoneNumber: '+380991112233' } as User;
    const telegram = {
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendPhotoFile: jest.fn().mockResolvedValue({ ok: true }),
      sendPhotoMediaGroup: jest.fn().mockResolvedValue(undefined),
      sendDocumentFile: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<TelegramApiService>;
    const users = {
      upsertTelegramUser: jest.fn().mockResolvedValue(userWithoutPhone),
      updatePhoneNumber: jest.fn().mockResolvedValue(userWithPhone),
    } as unknown as jest.Mocked<UserService>;
    const products = {
      getActiveProductBySlug: jest.fn().mockResolvedValue(consultation),
    } as unknown as jest.Mocked<ProductService>;
    const subscriptions = {
      hasActiveSubscription: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<SubscriptionService>;
    const payments = {
      createWayForPayAttempt: jest.fn().mockResolvedValue({
        id: 'payment-attempt-id',
        provider: PaymentProvider.WayForPay,
        amount: '1000.00',
        currency: 'UAH',
        paymentUrl: 'https://example.test/checkout',
      }),
    } as unknown as jest.Mocked<PaymentService>;
    const notifications = {
      notifyProductAccessBySubscription: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    const support = {
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SupportService>;
    const liveEvents = {
      register: jest.fn(),
    } as unknown as jest.Mocked<LiveEventsService>;
    const activity = {
      track: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserActivityService>;
    const attribution = {
      attachTelegramUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AttributionService>;
    const service = new BotService(
      telegram,
      users,
      products,
      subscriptions,
      payments,
      notifications,
      support,
      liveEvents,
      activity,
      attribution,
      new BotFlowService(),
      {
        get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService,
    );

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'payment:start:consultation-format-1',
      },
    });

    expect(payments.createWayForPayAttempt).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
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

    await service.handleUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        from: { id: 123456, first_name: 'Jane' },
        chat: { id: 123456, type: 'private' },
        contact: {
          phone_number: '+380991112233',
          first_name: 'Jane',
          user_id: 123456,
        },
      },
    });

    expect(users.updatePhoneNumber).toHaveBeenCalledWith(
      user.id,
      '+380991112233',
    );
    expect(payments.createWayForPayAttempt).toHaveBeenCalledWith(
      userWithPhone,
      consultation,
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      'Спасибо, номер телефона сохранён.',
      new BotFlowService().buildReplyKeyboard(),
    );
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      expect.stringContaining('Сумма: 1000.00 UAH'),
      expect.objectContaining({
        inline_keyboard: expect.arrayContaining([
          [
            {
              text: '💳 Оплатить',
              url: 'https://example.test/checkout',
            },
          ],
        ]),
      }),
    );
  });

  it('opens included material for active The Cycle subscribers without payment', async () => {
    const telegram = {
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendPhotoFile: jest.fn().mockResolvedValue({ ok: true }),
      sendPhotoMediaGroup: jest.fn().mockResolvedValue(undefined),
      sendDocumentFile: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<TelegramApiService>;
    const users = {
      upsertTelegramUser: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<UserService>;
    const material = {
      id: 'material-id',
      slug: 'material-3',
      title: 'Методичка по ранней седине',
      type: ProductType.OneTime,
      includedInSubscription: true,
    };
    const theCycle = {
      id: 'the-cycle-id',
      slug: 'the-cycle',
      title: 'The Cycle',
      type: ProductType.Subscription,
      includedInSubscription: false,
    };
    const products = {
      getActiveProductBySlug: jest.fn(async (slug: string) => {
        if (slug === 'material-3') {
          return material;
        }

        return theCycle;
      }),
    } as unknown as jest.Mocked<ProductService>;
    const subscriptions = {
      hasActiveSubscription: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<SubscriptionService>;
    const payments = {
      createWayForPayAttempt: jest.fn(),
    } as unknown as jest.Mocked<PaymentService>;
    const notifications = {
      notifyProductAccessBySubscription: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationService>;
    const support = {
      create: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SupportService>;
    const liveEvents = {
      register: jest.fn(),
    } as unknown as jest.Mocked<LiveEventsService>;
    const activity = {
      track: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UserActivityService>;
    const attribution = {
      attachTelegramUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AttributionService>;

    const service = new BotService(
      telegram,
      users,
      products,
      subscriptions,
      payments,
      notifications,
      support,
      liveEvents,
      activity,
      attribution,
      new BotFlowService(),
      {
        get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService,
    );

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'payment:start:material-3',
      },
    });

    expect(products.getActiveProductBySlug).toHaveBeenCalledWith('material-3');
    expect(products.getActiveProductBySlug).toHaveBeenCalledWith('the-cycle');
    expect(subscriptions.hasActiveSubscription).toHaveBeenCalledWith(
      user.id,
      'the-cycle-id',
    );
    expect(
      notifications.notifyProductAccessBySubscription,
    ).toHaveBeenCalledWith(user, material);
    expect(payments.createWayForPayAttempt).not.toHaveBeenCalled();
  });

  it('does not start payment for legacy The Cycle payment callbacks', async () => {
    const telegram = {
      answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendPhotoFile: jest.fn().mockResolvedValue({ ok: true }),
      sendPhotoMediaGroup: jest.fn().mockResolvedValue(undefined),
      sendDocumentFile: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<TelegramApiService>;
    const users = {
      upsertTelegramUser: jest.fn().mockResolvedValue(user),
    } as unknown as jest.Mocked<UserService>;
    const products = {
      getActiveProductBySlug: jest.fn(),
    } as unknown as jest.Mocked<ProductService>;
    const payments = {
      createWayForPayAttempt: jest.fn(),
    } as unknown as jest.Mocked<PaymentService>;

    const service = new BotService(
      telegram,
      users,
      products,
      {} as SubscriptionService,
      payments,
      {
        notifyProductAccessBySubscription: jest.fn(),
      } as unknown as NotificationService,
      { create: jest.fn() } as unknown as SupportService,
      { register: jest.fn() } as unknown as LiveEventsService,
      {
        track: jest.fn().mockResolvedValue(undefined),
      } as unknown as UserActivityService,
      { attachTelegramUser: jest.fn() } as unknown as AttributionService,
      new BotFlowService(),
      {
        get: jest.fn((_key: string, defaultValue?: string) => defaultValue),
      } as unknown as ConfigService,
    );

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'payment:start:the-cycle',
      },
    });

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      123456,
      'Оплата The Cycle сейчас недоступна.',
    );
    expect(products.getActiveProductBySlug).not.toHaveBeenCalled();
    expect(payments.createWayForPayAttempt).not.toHaveBeenCalled();
  });
});
