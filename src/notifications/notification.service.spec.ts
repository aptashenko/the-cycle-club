import { ConfigService } from '@nestjs/config';
import { BotFlowService } from '../bot/bot-flow.service';
import { PaymentProvider, ProductType } from '../common/enums';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { SupportRequest } from '../support/support-request.entity';
import { User } from '../users/user.entity';
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
    } as unknown as TelegramApiService;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {
      getPaymentSuccessMessage: jest.fn(() => 'payment success'),
    } as unknown as BotFlowService;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
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
    } as unknown as TelegramApiService;
    const adminTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminTelegramApiService;
    const flow = {} as BotFlowService;
    const service = new NotificationService(
      config,
      telegram,
      adminTelegram,
      flow,
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
});
