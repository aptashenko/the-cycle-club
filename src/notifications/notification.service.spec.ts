import { ConfigService } from '@nestjs/config';
import { BotFlowService } from '../bot/bot-flow.service';
import { PaymentProvider, ProductType } from '../common/enums';
import { InviteLinksService } from '../invite-links/invite-links.service';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
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
