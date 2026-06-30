import { ConfigService } from '@nestjs/config';
import { BotFlowService } from '../bot/bot-flow.service';
import { PaymentAttemptStatus, PaymentProvider } from '../common/enums';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';
import { AdminTelegramApiService } from '../admin-bot/admin-telegram-api.service';
import { TelegramApiService } from './telegram-api.service';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  it('does not send user reminders for abandoned payments', async () => {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'ADMIN_TELEGRAM_ID' ? 'admin-chat-id' : defaultValue,
      ),
    } as unknown as ConfigService;
    const telegram = {
      sendMessage: jest.fn(),
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

    const paymentAttempt = {
      amount: '100.00',
      currency: 'UAH',
      paymentUrl: 'https://example.com/pay',
      provider: PaymentProvider.WayForPay,
      providerOrderId: 'order-1',
      status: PaymentAttemptStatus.Abandoned,
      product: { title: 'The Cycle' } as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
        telegramId: 'user-chat-id',
        username: 'jane',
      } as User,
    } as PaymentAttempt;

    await service.notifyAbandonedPayment(paymentAttempt);

    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(adminTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(adminTelegram.sendMessage).toHaveBeenCalledWith(
      'admin-chat-id',
      expect.stringContaining('Оплата не завершена'),
      undefined,
    );
  });
});
