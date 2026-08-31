import { ConfigService } from '@nestjs/config';
import {
  PaymentAttemptStatus,
  PaymentProvider,
  ProductType,
} from '../common/enums';
import { NotificationService } from '../notifications/notification.service';
import { Product } from '../products/product.entity';
import { SubscriptionService } from '../subscriptions/subscription.service';
import { UserActivityService } from '../user-activity/user-activity.service';
import { User } from '../users/user.entity';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentService } from './payment.service';
import { WayForPayService } from './wayforpay.service';

describe('PaymentService special offer availability', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render checkout for The Cycle special offer after the first day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-01T22:00:00.000Z'));

    const paymentAttempt = {
      id: 'payment-attempt-id',
      status: PaymentAttemptStatus.Pending,
      provider: PaymentProvider.WayForPay,
      amount: '1499.00',
      currency: 'UAH',
      createdAt: new Date('2026-09-01T10:00:00.000Z'),
      product: {
        slug: 'the-cycle-today-offer',
        title: 'The Cycle',
        type: ProductType.Subscription,
      } as Product,
      user: {
        firstName: 'Jane',
        lastName: 'Doe',
      } as User,
    } as PaymentAttempt;
    const repository = {
      findOne: jest.fn().mockResolvedValue(paymentAttempt),
    };
    const wayForPay = {
      renderCheckoutForm: jest.fn(),
    } as unknown as jest.Mocked<WayForPayService>;
    const service = new PaymentService(
      repository as never,
      {} as ConfigService,
      wayForPay,
      {} as SubscriptionService,
      {} as NotificationService,
      { track: jest.fn() } as unknown as UserActivityService,
    );

    await expect(
      service.renderCheckout('payment-attempt-id'),
    ).resolves.toContain('Ссылка будет доступна через месяц.');
    expect(wayForPay.renderCheckoutForm).not.toHaveBeenCalled();
  });
});
