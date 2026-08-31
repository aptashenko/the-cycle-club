import { ConfigService } from '@nestjs/config';
import { BotFlowService } from '../bot/bot-flow.service';
import { PaymentProvider, ProductType } from '../common/enums';
import { InviteLinksService } from '../invite-links/invite-links.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { User } from '../users/user.entity';
import { UserService } from '../users/user.service';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { TelegramApiService } from './telegram-api.service';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('sends admin alert for successful payments', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as TelegramApiService;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {
      getPaymentSuccessMessage: jest.fn(() => 'payment success'),
    } as unknown as BotFlowService;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn(),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    const paymentAttempt = {
      amount: '100.00',
      currency: 'UAH',
      paidAt: new Date('2026-07-01T12:00:00.000Z'),
      provider: PaymentProvider.WayForPay,
      providerOrderId: 'order-1',
      providerTransactionId: 'tx-1',
      product: {
        title: 'The Cycle',
        type: ProductType.Subscription,
      } as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as PaymentAttempt;

    await service.notifyPaymentSuccess(paymentAttempt);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      'payment success',
      undefined,
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      'admin-chat-id',
      expect.stringContaining('Новая оплата'),
      undefined,
    );
  });

  it('sends support request message text to admins', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as TelegramApiService;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {} as BotFlowService;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn(),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    await service.notifySupportRequest({
      id: 'support-request-id',
      topic: '📝 Другое',
      message: 'Вопрос <важный> & срочный',
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as SupportRequest);

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      'admin-chat-id',
      expect.stringContaining('Вопрос &lt;важный&gt; &amp; срочный'),
      expect.objectContaining({
        inline_keyboard: expect.any(Array),
      }),
    );
  });

  it('sends admin alert when a user is removed from the closed group', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as TelegramApiService;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {} as BotFlowService;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn(),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    await service.notifyUserRemovedFromClosedGroup({
      expiresAt: new Date('2026-07-01T12:00:00.000Z'),
      product: {
        title: 'The Cycle',
      } as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as Subscription);

    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      'admin-chat-id',
      expect.stringContaining('Пользователь удален из закрытой группы'),
      undefined,
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      'admin-chat-id',
      expect.stringContaining('user-chat-id'),
      undefined,
    );
  });

  it('sends a generated single-use invite link for paid marathon', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'ADMIN_TELEGRAM_ID') {
          return 'admin-chat-id';
        }

        if (key === 'MARATHON_CHANNEL_CHAT_ID') {
          return '-1001234567890';
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as jest.Mocked<TelegramApiService>;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {
      getPaymentSuccessMessage: jest.fn(() => 'payment success'),
    } as unknown as BotFlowService;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn().mockResolvedValue({
        inviteLink: 'https://t.me/+singleUse',
        memberLimit: 1,
      }),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    await service.notifyPaymentSuccess({
      id: 'payment-attempt-id',
      amount: '1499.00',
      currency: 'UAH',
      paidAt: new Date('2026-07-01T12:00:00.000Z'),
      provider: PaymentProvider.WayForPay,
      providerOrderId: 'order-1',
      providerTransactionId: 'tx-1',
      product: {
        slug: 'marathon-4',
        title: 'Марафон по детоксу - 4 поток',
        type: ProductType.OneTime,
        downloadFiles: [],
      } as unknown as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as PaymentAttempt);

    expect(inviteLinks.createSingleUseInviteLink).toHaveBeenCalledWith({
      chatId: '-1001234567890',
      name: 'marathon-4:payment-atte',
      expireInSeconds: undefined,
    });
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      expect.stringContaining('Доступ к каналу марафона готов'),
      {
        inline_keyboard: [
          [
            {
              text: 'Перейти в канал марафона ✅',
              url: 'https://t.me/+singleUse',
            },
          ],
        ],
      },
    );
  });

  it('sends a generated single-use invite link for paid The Cycle special offer', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'ADMIN_TELEGRAM_ID') {
          return 'admin-chat-id';
        }

        if (key === 'THE_CYCLE_CLUB_CHAT_ID') {
          return '-1009876543210';
        }

        return defaultValue;
      }),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as jest.Mocked<TelegramApiService>;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {
      getPaymentSuccessMessage: jest.fn(() => 'payment success'),
    } as unknown as BotFlowService;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn().mockResolvedValue({
        inviteLink: 'https://t.me/+theCycleSingleUse',
        memberLimit: 1,
      }),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    await service.notifyPaymentSuccess({
      id: 'payment-attempt-id',
      amount: '1499.00',
      currency: 'UAH',
      paidAt: new Date('2026-07-01T12:00:00.000Z'),
      provider: PaymentProvider.WayForPay,
      providerOrderId: 'order-1',
      providerTransactionId: 'tx-1',
      product: {
        slug: 'the-cycle-today-offer',
        title: 'The Cycle',
        type: ProductType.Subscription,
        downloadFiles: [],
      } as unknown as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as PaymentAttempt);

    expect(inviteLinks.createSingleUseInviteLink).toHaveBeenCalledWith({
      chatId: '-1009876543210',
      name: 'the-cycle-today-offer:payment-atte',
    });
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      expect.stringContaining('Доступ в The Cycle готов'),
      {
        inline_keyboard: [
          [
            {
              text: 'Вступить в The Cycle ✅',
              url: 'https://t.me/+theCycleSingleUse',
            },
          ],
        ],
      },
    );
  });

  it('sends consultation success message with assistant link', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as jest.Mocked<TelegramApiService>;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {
      getPaymentSuccessMessage: jest.fn(() => 'payment success'),
    } as unknown as jest.Mocked<BotFlowService>;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn(),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    await service.notifyPaymentSuccess({
      id: 'payment-attempt-id',
      amount: '1000.00',
      currency: 'UAH',
      paidAt: new Date('2026-07-01T12:00:00.000Z'),
      provider: PaymentProvider.WayForPay,
      providerOrderId: 'order-1',
      providerTransactionId: 'tx-1',
      product: {
        slug: 'consultation-format-1',
        title: 'EXPRESS | 100 €',
        type: ProductType.OneTime,
        downloadFiles: [],
      } as unknown as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as PaymentAttempt);

    expect(flow.getPaymentSuccessMessage).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      'user-chat-id',
      expect.stringContaining('с вами свяжется ассистент'),
      {
        inline_keyboard: [
          [
            {
              text: 'Связаться с ассистентом',
              url: 'https://telegram.me/assistant_nicolaeva',
            },
          ],
        ],
      },
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '7522999600',
      expect.stringContaining('Jane Doe @jane'),
    );
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      'admin-chat-id',
      expect.stringContaining('Новая оплата'),
      undefined,
    );
  });

  it('uses phone number in assistant notification when consultation buyer is hidden', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      isBotBlockedByUser: jest.fn(() => false),
    } as unknown as jest.Mocked<TelegramApiService>;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      {
        getPaymentSuccessMessage: jest.fn(() => 'payment success'),
      } as unknown as BotFlowService,
      {
        createSingleUseInviteLink: jest.fn(),
      } as unknown as jest.Mocked<InviteLinksService>,
      {
        markBotBlocked: jest.fn(),
      } as unknown as jest.Mocked<UserService>,
    );

    await service.notifyPaymentSuccess({
      id: 'payment-attempt-id',
      amount: '2250.00',
      currency: 'UAH',
      paidAt: new Date('2026-07-01T12:00:00.000Z'),
      provider: PaymentProvider.WayForPay,
      providerOrderId: 'order-1',
      providerTransactionId: 'tx-1',
      product: {
        slug: 'consultation-format-2',
        title: 'Первичная | 225 €',
        type: ProductType.OneTime,
        downloadFiles: [],
      } as unknown as Product,
      user: {
        telegramId: 'hidden-user-chat-id',
        phoneNumber: '+380991112233',
      } as User,
    } as PaymentAttempt);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '7522999600',
      expect.stringContaining('+380991112233'),
    );
  });

  it('marks user as bot-blocked when Telegram returns blocked error', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const blockedResponse = {
      ok: false,
      description: 'Forbidden: bot was blocked by the user',
    };
    const telegram = {
      sendMessage: jest.fn().mockResolvedValue(blockedResponse),
      isBotBlockedByUser: jest.fn(() => true),
    } as unknown as jest.Mocked<TelegramApiService>;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {
      getPaymentSuccessMessage: jest.fn(() => 'payment success'),
    } as unknown as BotFlowService;
    const inviteLinks = {
      createSingleUseInviteLink: jest.fn(),
    } as unknown as jest.Mocked<InviteLinksService>;
    const users = {
      markBotBlocked: jest.fn(),
    } as unknown as jest.Mocked<UserService>;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
      inviteLinks,
      users,
    );

    await service.notifyPaymentSuccess({
      amount: '100.00',
      currency: 'UAH',
      paidAt: new Date('2026-07-01T12:00:00.000Z'),
      providerTransactionId: 'tx-1',
      product: {
        title: 'The Cycle',
        type: ProductType.Subscription,
      } as Product,
      user: {
        telegramId: 'user-chat-id',
      } as User,
    } as PaymentAttempt);

    expect(users.markBotBlocked).toHaveBeenCalledWith(
      'user-chat-id',
      'Forbidden: bot was blocked by the user',
    );
  });
});
