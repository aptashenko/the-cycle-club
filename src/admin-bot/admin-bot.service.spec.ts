import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { BotFlowService } from '../bot/bot-flow.service';
import { TelegramUpdate } from '../bot/telegram.types';
import { InviteLinksService } from '../invite-links/invite-links.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminBotService } from './admin-bot.service';
import { AdminTelegramApiService } from './admin-telegram-api.service';
import { BroadcastCampaign } from './broadcast-campaign.entity';
import { BroadcastDelivery } from './broadcast-delivery.entity';
import { BroadcastMediaAsset } from './broadcast-media-asset.entity';

type BroadcastButton = {
  text: string;
  url?: string;
  callbackData?: string;
};

type AdminBotServicePrivate = {
  runBroadcast(
    chatId: string | number,
    text: string,
    button?: BroadcastButton,
    media?: unknown,
    recipientsCount?: number,
  ): Promise<void>;
  sleep(ms: number): Promise<void>;
};

function adminMessage(text: string): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 123, first_name: 'Admin' },
      chat: { id: 123, type: 'private' },
      text,
    },
  };
}

function adminPhoto(): TelegramUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 123, first_name: 'Admin' },
      chat: { id: 123, type: 'private' },
      photo: [
        {
          file_id: 'photo-small-file-id',
          file_unique_id: 'photo-small-unique-id',
          width: 320,
          height: 240,
          file_size: 1000,
        },
        {
          file_id: 'photo-large-file-id',
          file_unique_id: 'photo-large-unique-id',
          width: 1280,
          height: 960,
          file_size: 5000,
        },
      ],
    },
  };
}

function adminCallback(data: string): TelegramUpdate {
  return {
    update_id: 1,
    callback_query: {
      id: 'callback-id',
      from: { id: 123, first_name: 'Admin' },
      message: {
        message_id: 10,
        from: { id: 456, first_name: 'Admin bot', is_bot: true },
        chat: { id: 123, type: 'private' },
      },
      data,
    },
  };
}

function createService() {
  const adminTelegram = {
    sendMessage: jest.fn().mockResolvedValue({ ok: true }),
    answerCallbackQuery: jest.fn().mockResolvedValue({ ok: true }),
    editMessageReplyMarkup: jest.fn().mockResolvedValue({ ok: true }),
    getFile: jest.fn().mockResolvedValue({
      ok: true,
      result: { file_path: 'photos/file.jpg' },
    }),
    downloadFile: jest.fn().mockResolvedValue(Buffer.from('photo-bytes')),
  } as unknown as jest.Mocked<AdminTelegramApiService>;
  const mainTelegram = {
    sendMessage: jest
      .fn()
      .mockResolvedValue({ ok: true, result: { message_id: 101 } }),
    sendVideoNoteFile: jest
      .fn()
      .mockResolvedValue({ ok: true, result: { message_id: 100 } }),
    sendPhotoBuffer: jest
      .fn()
      .mockResolvedValue({ ok: true, result: { message_id: 100 } }),
    deleteMessage: jest.fn().mockResolvedValue({ ok: true }),
  } as unknown as jest.Mocked<TelegramApiService>;
  const flow = {
    getScreenText: jest
      .fn()
      .mockReturnValue('Marathon <b>payment</b> broadcast'),
    buildScreenInlineKeyboard: jest.fn().mockReturnValue([
      [
        {
          text: 'Записаться на марафон 1499.00 UAH',
          callback_data: 'payment:start:marathon-4',
        },
      ],
    ]),
  } as unknown as jest.Mocked<BotFlowService>;
  const inviteLinks = {
    createSingleUseInviteLink: jest.fn().mockResolvedValue({
      inviteLink: 'https://t.me/+singleUse',
      memberLimit: 1,
    }),
  } as unknown as jest.Mocked<InviteLinksService>;
  const config = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'ADMIN_TELEGRAM_IDS') {
        return '123';
      }

      if (key === 'MARATHON_CHANNEL_CHAT_ID') {
        return '-1004456845123';
      }

      if (key === 'CLOSED_GROUP_CHAT_ID') {
        return '-1001234567890';
      }

      return defaultValue;
    }),
  } as unknown as ConfigService;
  const users = {
    count: jest.fn().mockResolvedValue(1),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn((user: User) => Promise.resolve(user)),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    })),
    find: jest
      .fn()
      .mockResolvedValueOnce([{ telegramId: 'user-chat-id' }])
      .mockResolvedValueOnce([]),
  } as unknown as jest.Mocked<Repository<User>>;
  const supportRequest = {
    id: 'support-request-id',
    topic: 'Оплата',
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    user: {
      telegramId: 'user-chat-id',
      firstName: 'Client',
    },
  } as SupportRequest;
  const supportRequests = {
    find: jest.fn().mockResolvedValue([supportRequest]),
    findOne: jest.fn().mockResolvedValue(supportRequest),
  } as unknown as jest.Mocked<Repository<SupportRequest>>;
  const products = {
    findOne: jest.fn((options?: { where?: { slug?: string } }) => {
      if (options?.where?.slug === 'the-cycle') {
        return Promise.resolve({
          id: 'the-cycle-product-id',
          slug: 'the-cycle',
          title: 'The Cycle',
          price: '899.00',
          currency: 'UAH',
          isActive: true,
        });
      }

      return Promise.resolve({
        id: 'marathon-product-id',
        slug: 'marathon-4',
        title: 'Марафон по детоксу - 4 поток',
        price: '1499.00',
        currency: 'UAH',
        isActive: true,
      });
    }),
    find: jest.fn().mockResolvedValue([
      {
        id: 'the-cycle-product-id',
        slug: 'the-cycle',
        title: 'The Cycle',
        price: '899.00',
        currency: 'UAH',
        isActive: true,
      },
      {
        id: 'marathon-product-id',
        slug: 'marathon-4',
        title: 'Марафон по детоксу - 4 поток',
        price: '1499.00',
        currency: 'UAH',
        isActive: true,
      },
    ]),
  } as unknown as jest.Mocked<Repository<Product>>;
  const subscriptions = {
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((subscription: Partial<Subscription>) => subscription),
    save: jest.fn((subscription: Subscription) =>
      Promise.resolve({
        ...subscription,
        id: subscription.id ?? 'subscription-id',
      }),
    ),
  } as unknown as jest.Mocked<Repository<Subscription>>;
  const payments = {
    count: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<Repository<PaymentAttempt>>;
  const activity = {
    count: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<Repository<UserActivityEvent>>;
  const broadcastMediaAssets = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((input: Partial<BroadcastMediaAsset>) => input),
    save: jest.fn(
      async (input: Partial<BroadcastMediaAsset>) =>
        ({
          id: 'media-asset-id',
          ...input,
        }) as BroadcastMediaAsset,
    ),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  } as unknown as jest.Mocked<Repository<BroadcastMediaAsset>>;
  const broadcastCampaign = {
    id: 'broadcast-id',
    text: 'Hello <club>',
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    sentCount: 1,
    failedCount: 0,
    skippedCount: 0,
    deletedCount: 0,
    deleteFailedCount: 0,
  } as BroadcastCampaign;
  const broadcastCampaigns = {
    create: jest.fn((input: Partial<BroadcastCampaign>) => input),
    save: jest.fn(
      async (input: Partial<BroadcastCampaign>) =>
        ({
          id: 'broadcast-id',
          sentCount: 0,
          failedCount: 0,
          skippedCount: 0,
          deletedCount: 0,
          deleteFailedCount: 0,
          ...input,
        }) as BroadcastCampaign,
    ),
    find: jest.fn().mockResolvedValue([broadcastCampaign]),
    findOne: jest.fn().mockResolvedValue(broadcastCampaign),
  } as unknown as jest.Mocked<Repository<BroadcastCampaign>>;
  const broadcastDelivery = {
    id: 'delivery-id',
    broadcastId: 'broadcast-id',
    telegramId: 'user-chat-id',
    messageId: 101,
    messageType: 'text',
    sentAt: new Date('2026-07-21T12:01:00.000Z'),
  } as BroadcastDelivery;
  const broadcastDeliveries = {
    create: jest.fn((input: Partial<BroadcastDelivery>) => input),
    save: jest.fn(
      async (input: Partial<BroadcastDelivery>) =>
        ({
          id: 'delivery-id',
          ...input,
        }) as BroadcastDelivery,
    ),
    find: jest.fn().mockResolvedValue([broadcastDelivery]),
  } as unknown as jest.Mocked<Repository<BroadcastDelivery>>;

  const service = new AdminBotService(
    adminTelegram,
    mainTelegram,
    flow,
    inviteLinks,
    config,
    users,
    products,
    subscriptions,
    payments,
    supportRequests,
    activity,
    broadcastMediaAssets,
    broadcastCampaigns,
    broadcastDeliveries,
  );

  return {
    service,
    adminTelegram,
    mainTelegram,
    users,
    supportRequests,
    products,
    subscriptions,
    payments,
    activity,
    broadcastMediaAssets,
    broadcastCampaigns,
    broadcastDeliveries,
    flow,
    inviteLinks,
  };
}

describe('AdminBotService', () => {
  it('shows grouped admin menu sections', async () => {
    const { service, adminTelegram } = createService();

    await service.handleUpdate(adminMessage('/menu'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('The Cycle Admin'),
      expect.objectContaining({
        keyboard: expect.arrayContaining([
          [{ text: '🏁 Марафон' }],
          [{ text: '👥 Пользователи' }],
          [{ text: '💬 Коммуникации' }],
          [{ text: '💳 Рассылка с оплатой' }],
        ]),
        resize_keyboard: true,
      }),
    );
  });

  it('opens bottom marathon flow picker first', async () => {
    const { service, adminTelegram } = createService();

    await service.handleUpdate(adminMessage('🏁 Марафон'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Марафон'),
      {
        keyboard: [[{ text: '🥑 Марафон №4' }], [{ text: '← Назад' }]],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
        selective: true,
      },
    );
  });

  it('opens selected marathon flow action menu', async () => {
    const { service, adminTelegram } = createService();

    await service.handleUpdate(adminMessage('🏁 Марафон'));
    await service.handleUpdate(adminMessage('🥑 Марафон №4'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Марафон №4'),
      {
        keyboard: [
          [{ text: '📊 Статистика' }],
          [{ text: '📣 Рассылка' }],
          [{ text: '🔗 Получить разовую инвайт-ссылку' }],
          [{ text: '← Назад' }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
        selective: true,
      },
    );
  });

  it('generates a single-use invite link from selected marathon flow menu', async () => {
    const { service, adminTelegram, inviteLinks } = createService();

    await service.handleUpdate(adminMessage('🏁 Марафон'));
    await service.handleUpdate(adminMessage('🥑 Марафон №4'));
    await service.handleUpdate(
      adminMessage('🔗 Получить разовую инвайт-ссылку'),
    );

    expect(inviteLinks.createSingleUseInviteLink).toHaveBeenCalledWith({
      chatId: '-1004456845123',
      name: expect.stringMatching(/^marathon-4:admin:\d+$/),
      expireInSeconds: undefined,
    });
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Разовая инвайт-ссылка готова'),
      {
        inline_keyboard: [
          [{ text: 'Открыть ссылку', url: 'https://t.me/+singleUse' }],
        ],
      },
    );
  });

  it('sends a single-use closed group invite when granting The Cycle subscription', async () => {
    const {
      service,
      adminTelegram,
      mainTelegram,
      inviteLinks,
      subscriptions,
      users,
    } = createService();
    const user = {
      id: 'user-id',
      telegramId: '987654321',
      username: 'client_user',
      firstName: 'Client',
      membershipStatus: 'none',
    } as User;
    const getOne = jest.fn().mockResolvedValue(user);
    const where = jest.fn().mockReturnValue({ getOne });
    jest.spyOn(users, 'createQueryBuilder').mockReturnValue({
      where,
    } as unknown as ReturnType<Repository<User>['createQueryBuilder']>);
    users.findOne.mockResolvedValue(user);

    await service.handleUpdate(adminMessage('/grant_subscription'));
    await service.handleUpdate(adminMessage('@client_user'));
    await service.handleUpdate(adminMessage('31.12.2026'));

    expect(subscriptions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        productId: 'the-cycle-product-id',
        status: 'active',
        expiresAt: expect.any(Date),
      }),
    );
    expect(inviteLinks.createSingleUseInviteLink).toHaveBeenCalledWith({
      chatId: '-1001234567890',
      name: expect.stringMatching(/^the-cycle:grant:987654321:\d+$/),
    });
    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      '987654321',
      expect.stringContaining('Доступ к The Cycle открыт'),
      {
        inline_keyboard: [
          [{ text: 'Перейти в клуб ✅', url: 'https://t.me/+singleUse' }],
        ],
      },
    );
    expect(adminTelegram.sendMessage).toHaveBeenLastCalledWith(
      123,
      expect.stringContaining('Invite: sent to user'),
    );
  });

  it('finds a user by Telegram ID when granting The Cycle subscription', async () => {
    const {
      service,
      adminTelegram,
      mainTelegram,
      inviteLinks,
      subscriptions,
      users,
    } = createService();
    const user = {
      id: 'user-id',
      telegramId: '987654321',
      username: 'client_user',
      firstName: 'Client',
      membershipStatus: 'none',
    } as User;
    users.findOne.mockResolvedValue(user);

    await service.handleUpdate(adminMessage('/grant_subscription'));
    await service.handleUpdate(adminMessage('987654321'));
    await service.handleUpdate(adminMessage('31.12.2026'));

    expect(users.createQueryBuilder).not.toHaveBeenCalled();
    expect(users.findOne).toHaveBeenCalledWith({
      where: { telegramId: '987654321' },
    });
    expect(subscriptions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        productId: 'the-cycle-product-id',
        status: 'active',
        expiresAt: expect.any(Date),
      }),
    );
    expect(inviteLinks.createSingleUseInviteLink).toHaveBeenCalledWith({
      chatId: '-1001234567890',
      name: expect.stringMatching(/^the-cycle:grant:987654321:\d+$/),
    });
    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      '987654321',
      expect.stringContaining('Доступ к The Cycle открыт'),
      {
        inline_keyboard: [
          [{ text: 'Перейти в клуб ✅', url: 'https://t.me/+singleUse' }],
        ],
      },
    );
    expect(adminTelegram.sendMessage).toHaveBeenLastCalledWith(
      123,
      expect.stringContaining('Invite: sent to user'),
    );
  });

  it('collects a broadcast URL button before confirmation', async () => {
    const { service, adminTelegram } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast'));
    await service.handleUpdate(adminMessage('Hello <club>'));
    await service.handleUpdate(adminMessage('Купить'));
    await service.handleUpdate(adminMessage('https://example.com/page'));
    await service.handleUpdate(adminMessage('Без медиа'));
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Button: Купить'),
      {
        inline_keyboard: [
          [{ text: 'Купить', url: 'https://example.com/page' }],
        ],
      },
    );
    expect(runBroadcast).toHaveBeenCalledWith(
      123,
      'Hello <club>',
      {
        text: 'Купить',
        url: 'https://example.com/page',
      },
      undefined,
      1,
    );
  });

  it('sends broadcast messages with an inline URL button', async () => {
    const {
      service,
      adminTelegram,
      mainTelegram,
      broadcastCampaigns,
      broadcastDeliveries,
    } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    jest.spyOn(privateService, 'sleep').mockResolvedValue(undefined);

    await privateService.runBroadcast(123, 'Hello <club>', {
      text: 'Купить',
      url: 'https://example.com/page',
    });

    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'Hello &lt;club&gt;',
      {
        inline_keyboard: [
          [{ text: 'Купить', url: 'https://example.com/page' }],
        ],
      },
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Sent: 1'),
    );
    expect(broadcastCampaigns.save).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Hello <club>',
        sentCount: 1,
        failedCount: 0,
      }),
    );
    expect(broadcastDeliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: 'broadcast-id',
        telegramId: 'user-chat-id',
        messageId: 101,
        messageType: 'text',
      }),
    );
  });

  it('lists recent broadcasts with delete commands', async () => {
    const { service, adminTelegram } = createService();

    await service.handleUpdate(adminMessage('/broadcasts'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('/delete_broadcast broadcast-id'),
    );
  });

  it('deletes saved broadcast messages', async () => {
    const { service, adminTelegram, mainTelegram, broadcastDeliveries } =
      createService();

    await service.handleUpdate(adminMessage('/delete_broadcast broadcast-id'));

    expect(mainTelegram.deleteMessage).toHaveBeenCalledWith(
      'user-chat-id',
      101,
    );
    expect(broadcastDeliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'delivery-id',
        deletedAt: expect.any(Date),
        deleteError: null,
      }),
    );
    expect(adminTelegram.sendMessage).toHaveBeenLastCalledWith(
      123,
      expect.stringContaining('Broadcast delete finished'),
    );
  });

  it('saves a broadcast photo from admin message', async () => {
    const { service, adminTelegram, broadcastMediaAssets } = createService();

    await service.handleUpdate(adminMessage('/save_photo launch_photo'));
    await service.handleUpdate(adminPhoto());

    expect(adminTelegram.getFile).toHaveBeenCalledWith('photo-large-file-id');
    expect(broadcastMediaAssets.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'photo',
        key: 'launch_photo',
        adminFileId: 'photo-large-file-id',
        fileUniqueId: 'photo-large-unique-id',
        fileData: Buffer.from('photo-bytes'),
        fileSize: 5000,
        width: 1280,
        height: 960,
        createdByTelegramId: '123',
      }),
    );
    expect(adminTelegram.sendMessage).toHaveBeenLastCalledWith(
      123,
      expect.stringContaining('Photo saved'),
    );
  });

  it('sends broadcast photo media and stores its delivery', async () => {
    const { service, mainTelegram, broadcastMediaAssets, broadcastDeliveries } =
      createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    jest.spyOn(privateService, 'sleep').mockResolvedValue(undefined);
    jest.spyOn(broadcastMediaAssets, 'findOne').mockResolvedValue({
      id: 'photo-asset-id',
      type: 'photo',
      key: 'launch_photo',
      fileData: Buffer.from('photo-bytes'),
    } as BroadcastMediaAsset);

    await privateService.runBroadcast(
      123,
      'Hello <club>',
      undefined,
      {
        type: 'photo',
        assetId: 'photo-asset-id',
        key: 'launch_photo',
      },
      1,
    );

    expect(mainTelegram.sendPhotoBuffer).toHaveBeenCalledWith(
      'user-chat-id',
      Buffer.from('photo-bytes'),
    );
    expect(broadcastDeliveries.save).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: 'broadcast-id',
        telegramId: 'user-chat-id',
        messageId: 100,
        messageType: 'photo',
      }),
    );
  });

  it('accepts a direct photo upload while creating a broadcast', async () => {
    const { service, adminTelegram, broadcastMediaAssets } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast'));
    await service.handleUpdate(adminMessage('Hello with photo'));
    await service.handleUpdate(adminMessage('Без кнопки'));
    await service.handleUpdate(adminMessage('🖼 Фото'));
    await service.handleUpdate(adminPhoto());
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(adminTelegram.getFile).toHaveBeenCalledWith('photo-large-file-id');
    expect(broadcastMediaAssets.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'photo',
        key: expect.stringMatching(/^broadcast_photo_\d+_[a-z0-9]+$/),
        adminFileId: 'photo-large-file-id',
        fileData: Buffer.from('photo-bytes'),
      }),
    );
    expect(runBroadcast).toHaveBeenCalledWith(
      123,
      'Hello with photo',
      undefined,
      {
        type: 'photo',
        assetId: 'media-asset-id',
        key: expect.stringMatching(/^broadcast_photo_\d+_[a-z0-9]+$/),
      },
      1,
    );
  });

  it('starts a marathon payment broadcast with an inline callback button', async () => {
    const { service, adminTelegram } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast_marathon'));
    await service.handleUpdate(adminMessage('Стандартный текст'));
    await service.handleUpdate(adminMessage('Стандартная кнопка'));
    await service.handleUpdate(adminMessage('Без медиа'));
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining(
        'Callback: <code>payment:start:marathon-4</code>',
      ),
      {
        inline_keyboard: [
          [
            {
              text: 'Записаться на марафон 1499.00 UAH',
              callback_data: 'payment:start:marathon-4',
            },
          ],
        ],
      },
    );
    expect(runBroadcast).toHaveBeenCalledWith(
      123,
      'Marathon <b>payment</b> broadcast',
      {
        text: 'Записаться на марафон 1499.00 UAH',
        callbackData: 'payment:start:marathon-4',
      },
      undefined,
      1,
    );
  });

  it('starts a marathon payment broadcast with custom text', async () => {
    const { service } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast_marathon'));
    await service.handleUpdate(adminMessage('Мой текст про марафон'));
    await service.handleUpdate(adminMessage('Стандартная кнопка'));
    await service.handleUpdate(adminMessage('Без медиа'));
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(runBroadcast).toHaveBeenCalledWith(
      123,
      'Мой текст про марафон',
      {
        text: 'Записаться на марафон 1499.00 UAH',
        callbackData: 'payment:start:marathon-4',
      },
      undefined,
      1,
    );
  });

  it('starts a marathon payment broadcast with custom button text', async () => {
    const { service } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast_marathon'));
    await service.handleUpdate(adminMessage('Мой текст про марафон'));
    await service.handleUpdate(adminMessage('Оплатить марафон'));
    await service.handleUpdate(adminMessage('Без медиа'));
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(runBroadcast).toHaveBeenCalledWith(
      123,
      'Мой текст про марафон',
      {
        text: 'Оплатить марафон',
        callbackData: 'payment:start:marathon-4',
      },
      undefined,
      1,
    );
  });

  it('creates a product payment broadcast with a WayForPay callback button', async () => {
    const { service, adminTelegram } = createService();
    const privateService = service as unknown as AdminBotServicePrivate;
    const runBroadcast = jest
      .spyOn(privateService, 'runBroadcast')
      .mockResolvedValue(undefined);

    await service.handleUpdate(adminMessage('/broadcast_payment'));
    await service.handleUpdate(
      adminMessage('The Cycle (the-cycle) - 899.00 UAH'),
    );
    await service.handleUpdate(adminMessage('Текст рассылки про клуб'));
    await service.handleUpdate(adminMessage('Без медиа'));
    await service.handleUpdate(adminMessage('Стандартная кнопка оплаты'));
    await service.handleUpdate(adminMessage('✅ Подтвердить рассылку'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Choose a product for the payment button.'),
      expect.objectContaining({
        keyboard: expect.arrayContaining([
          [{ text: 'The Cycle (the-cycle) - 899.00 UAH' }],
        ]),
      }),
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Callback: <code>payment:start:the-cycle</code>'),
      {
        inline_keyboard: [
          [
            {
              text: 'Оплатить 899.00 UAH',
              callback_data: 'payment:start:the-cycle',
            },
          ],
        ],
      },
    );
    expect(runBroadcast).toHaveBeenCalledWith(
      123,
      'Текст рассылки про клуб',
      {
        text: 'Оплатить 899.00 UAH',
        callbackData: 'payment:start:the-cycle',
      },
      undefined,
      1,
    );
  });

  it('finds a user by Telegram username', async () => {
    const { service, adminTelegram, users } = createService();
    const user = {
      id: 'user-id',
      telegramId: '123456789',
      username: 'btflfl',
      firstName: 'Client',
      membershipStatus: 'none',
      createdAt: new Date('2026-07-21T12:00:00.000Z'),
    } as User;
    const getOne = jest.fn().mockResolvedValue(user);
    const where = jest.fn().mockReturnValue({ getOne });
    jest.spyOn(users, 'createQueryBuilder').mockReturnValue({
      where,
    } as unknown as ReturnType<Repository<User>['createQueryBuilder']>);

    await service.handleUpdate(adminMessage('/user @btflfl'));

    expect(users.findOne).not.toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith(
      'LOWER(user.username) = LOWER(:username)',
      { username: 'btflfl' },
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Username: @btflfl'),
    );
  });

  it('rejects invalid user references before querying Postgres', async () => {
    const { service, adminTelegram, users } = createService();

    await service.handleUpdate(adminMessage('/user bad!'));

    expect(users.findOne).not.toHaveBeenCalled();
    expect(users.createQueryBuilder).not.toHaveBeenCalled();
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      'Send a numeric Telegram ID or Telegram username, for example: <code>/user 123456789</code> or <code>/user @username</code>.',
    );
  });

  it('replies to a support request user from the admin bot', async () => {
    const { service, adminTelegram, mainTelegram, supportRequests } =
      createService();

    await service.handleUpdate(
      adminMessage('/reply_support support-request-id Hello <client>'),
    );

    expect(supportRequests.findOne).toHaveBeenCalledWith({
      where: { id: 'support-request-id' },
      relations: { user: true },
    });
    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'Hello &lt;client&gt;',
    );
    expect(adminTelegram.sendMessage).toHaveBeenLastCalledWith(
      123,
      expect.stringContaining('Support reply sent'),
    );
  });

  it('shows a reply button under support tickets', async () => {
    const { service, adminTelegram } = createService();

    await service.handleUpdate(adminMessage('/support'));

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Support request'),
      {
        inline_keyboard: [
          [
            {
              text: '↩️ Ответить',
              callback_data: 'support:reply:support-request-id',
            },
            {
              text: '✅ Завершить',
              callback_data: 'support:resolve:support-request-id',
            },
          ],
        ],
      },
    );
  });

  it('starts support reply from a ticket button', async () => {
    const { service, adminTelegram, mainTelegram } = createService();

    await service.handleUpdate(
      adminCallback('support:reply:support-request-id'),
    );
    await service.handleUpdate(adminMessage('Hello from button'));

    expect(adminTelegram.answerCallbackQuery).toHaveBeenCalledWith(
      'callback-id',
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      123,
      expect.stringContaining('Reply to support request'),
    );
    expect(mainTelegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'Hello from button',
    );
  });
});
