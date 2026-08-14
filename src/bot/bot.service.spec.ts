import { ConfigService } from '@nestjs/config';
import { ProductType } from '../common/enums';
import { AttributionService } from '../attribution/attribution.service';
import { LiveEventsService } from '../live-events/live-events.service';
import { NotificationService } from '../notifications/notification.service';
import { PaymentService } from '../payments/payment.service';
import { ProductService } from '../products/product.service';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { SupportService } from '../support/support.service';
import { UserActivityService } from '../user-activity/user-activity.service';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { TelegramApiService } from '../notifications/telegram-api.service';
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
    const flow = new BotFlowService();
    const config = {
      get: jest.fn(
        (key: string, defaultValue?: string) => env[key] ?? defaultValue,
      ),
    } as unknown as jest.Mocked<ConfigService>;

    const service = new BotService(
      telegram,
      users,
      {} as ProductService,
      {} as SubscriptionService,
      {} as PaymentService,
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
      flow,
      config,
    };
  };

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

  it('tracks personal channel button clicks and sends the channel link', async () => {
    const { service, telegram, activity } = buildService();

    await service.handleUpdate({
      update_id: 1,
      callback_query: {
        id: 'callback-id',
        from: { id: 123456, first_name: 'Jane' },
        message: {
          message_id: 10,
          chat: { id: 123456, type: 'private' },
        },
        data: 'tracked-link:personal-channel',
      },
    });

    expect(activity.track).toHaveBeenCalledWith(
      user,
      'link',
      'personal_channel_link_clicked',
      {
        trackingId: 'personal-channel',
        url: 'https://t.me/+aCEPu2L_KVo4MjJi',
      },
    );
    expect(telegram.sendMessage).toHaveBeenLastCalledWith(
      123456,
      'Ссылка доступна по кнопке ниже.',
      {
        inline_keyboard: [
          [{ text: 'Перейти', url: 'https://t.me/+aCEPu2L_KVo4MjJi' }],
        ],
      },
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
});
