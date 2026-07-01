import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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
import { WayForPayService, WayForPayWebhookPayload } from './wayforpay.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly paymentAttemptRepository: Repository<PaymentAttempt>,
    private readonly config: ConfigService,
    private readonly wayForPay: WayForPayService,
    private readonly subscriptions: SubscriptionService,
    private readonly notifications: NotificationService,
    private readonly activity: UserActivityService,
  ) {}

  async createWayForPayAttempt(
    user: User,
    product: Product,
  ): Promise<PaymentAttempt> {
    return this.createPaymentAttempt(user, product);
  }

  async createPaymentAttempt(
    user: User,
    product: Product,
  ): Promise<PaymentAttempt> {
    const provider = this.isMockMode()
      ? PaymentProvider.Mock
      : PaymentProvider.WayForPay;
    const paymentAttempt = this.paymentAttemptRepository.create({
      user,
      userId: user.id,
      product,
      productId: product.id,
      amount: product.price,
      currency: product.currency,
      status: PaymentAttemptStatus.Pending,
      provider,
      providerOrderId: `cycle-${Date.now()}-${user.telegramId}`,
      paymentUrl: 'pending',
    });

    const saved = await this.paymentAttemptRepository.save(paymentAttempt);
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    saved.paymentUrl = this.isMockMode()
      ? `${appUrl}/payments/mock/checkout/${saved.id}`
      : `${appUrl}/payments/wayforpay/checkout/${saved.id}`;

    return this.paymentAttemptRepository.save(saved);
  }

  async findById(id: string): Promise<PaymentAttempt> {
    const paymentAttempt = await this.paymentAttemptRepository.findOne({
      where: { id },
      relations: { user: true, product: true },
    });

    if (!paymentAttempt) {
      throw new NotFoundException('Payment attempt not found');
    }

    return paymentAttempt;
  }

  async renderCheckout(id: string): Promise<string> {
    const paymentAttempt = await this.findById(id);

    if (paymentAttempt.status !== PaymentAttemptStatus.Pending) {
      throw new BadRequestException('Payment attempt is not pending');
    }

    await this.activity.track(
      paymentAttempt.user,
      'payment',
      'wayforpay_checkout_opened',
      {
        paymentAttemptId: paymentAttempt.id,
        orderReference: paymentAttempt.providerOrderId,
        amount: paymentAttempt.amount,
        currency: paymentAttempt.currency,
        productId: paymentAttempt.productId,
      },
    );

    return this.wayForPay.renderCheckoutForm(paymentAttempt);
  }

  async renderMockCheckout(id: string): Promise<string> {
    const paymentAttempt = await this.findById(id);

    if (paymentAttempt.status !== PaymentAttemptStatus.Pending) {
      throw new BadRequestException('Payment attempt is not pending');
    }

    await this.activity.track(
      paymentAttempt.user,
      'payment',
      'mock_checkout_opened',
      {
        paymentAttemptId: paymentAttempt.id,
        amount: paymentAttempt.amount,
        currency: paymentAttempt.currency,
        productId: paymentAttempt.productId,
      },
    );

    return [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"><title>Mock payment</title>',
      '<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;line-height:1.45}button{font:inherit;padding:12px 16px;border:0;background:#111;color:white;border-radius:6px;cursor:pointer}.muted{color:#666}</style>',
      '</head><body>',
      '<h1>Тестовая оплата</h1>',
      `<p>Продукт: <b>${this.escapeHtml(paymentAttempt.product.title)}</b></p>`,
      `<p>Сумма: <b>${paymentAttempt.amount} ${paymentAttempt.currency}</b></p>`,
      '<p class="muted">Это dev-режим без WayForPay. Нажатие на кнопку активирует подписку.</p>',
      `<form method="POST" action="/payments/mock/confirm/${paymentAttempt.id}">`,
      '<button type="submit">Подтвердить тестовую оплату</button>',
      '</form>',
      '</body></html>',
    ].join('');
  }

  async confirmMockPayment(id: string) {
    await this.confirmMockPaymentAttempt(id);

    return [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"><title>Payment confirmed</title>',
      '<style>body{font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;line-height:1.45}</style>',
      '</head><body>',
      '<h1>Оплата подтверждена</h1>',
      '<p>Тестовая подписка активирована. Можно вернуться в Telegram и открыть “Мои подписки”.</p>',
      '</body></html>',
    ].join('');
  }

  async confirmMockPaymentAttempt(id: string): Promise<PaymentAttempt> {
    if (!this.isMockMode()) {
      throw new BadRequestException('Mock payments are disabled');
    }

    const paymentAttempt = await this.findById(id);

    if (paymentAttempt.status !== PaymentAttemptStatus.Paid) {
      paymentAttempt.status = PaymentAttemptStatus.Paid;
      paymentAttempt.paidAt = new Date();
      paymentAttempt.providerTransactionId = `mock-${Date.now()}`;
      paymentAttempt.rawPayload = { provider: 'mock', confirmedAt: new Date() };

      await this.paymentAttemptRepository.save(paymentAttempt);
      const subscription =
        paymentAttempt.product.type === ProductType.Subscription
          ? await this.subscriptions.activate(
              paymentAttempt.user,
              paymentAttempt.product,
            )
          : undefined;
      await this.notifications.notifyPaymentSuccess(
        paymentAttempt,
        subscription,
      );
    }

    return paymentAttempt;
  }

  async handleWayForPayWebhook(payload: WayForPayWebhookPayload) {
    this.logger.log(
      `WayForPay webhook received: orderReference=${String(
        payload.orderReference ?? '',
      )}, status=${String(payload.transactionStatus ?? '')}, reasonCode=${String(
        payload.reasonCode ?? '',
      )}, amount=${String(payload.amount ?? '')}, hasSignature=${Boolean(
        payload.merchantSignature,
      )}`,
    );

    if (!this.wayForPay.verifyWebhook(payload)) {
      this.logger.warn(
        `WayForPay webhook rejected: invalid signature for orderReference=${String(
          payload.orderReference ?? '',
        )}`,
      );
      throw new BadRequestException('Invalid WayForPay signature');
    }

    const orderReference = payload.orderReference;
    if (!orderReference) {
      this.logger.warn('WayForPay webhook rejected: missing orderReference');
      throw new BadRequestException('Missing orderReference');
    }

    const paymentAttempt = await this.paymentAttemptRepository.findOne({
      where: { providerOrderId: orderReference },
      relations: { user: true, product: true },
    });

    if (!paymentAttempt) {
      this.logger.warn(
        `WayForPay webhook rejected: payment attempt not found for orderReference=${orderReference}`,
      );
      throw new NotFoundException('Payment attempt not found');
    }

    paymentAttempt.rawPayload = payload;

    if (this.wayForPay.isApproved(payload)) {
      if (paymentAttempt.status !== PaymentAttemptStatus.Paid) {
        paymentAttempt.status = PaymentAttemptStatus.Paid;
        paymentAttempt.paidAt = new Date();
        paymentAttempt.providerTransactionId =
          String(payload.transactionId ?? payload.authCode ?? '') || undefined;

        await this.paymentAttemptRepository.save(paymentAttempt);
        const subscription =
          paymentAttempt.product.type === ProductType.Subscription
            ? await this.subscriptions.activate(
                paymentAttempt.user,
                paymentAttempt.product,
              )
            : undefined;
        await this.notifications.notifyPaymentSuccess(
          paymentAttempt,
          subscription,
        );
        await this.activity.track(
          paymentAttempt.user,
          'payment',
          'wayforpay_payment_approved',
          {
            paymentAttemptId: paymentAttempt.id,
            orderReference,
            transactionId: paymentAttempt.providerTransactionId,
            amount: paymentAttempt.amount,
            currency: paymentAttempt.currency,
            productId: paymentAttempt.productId,
          },
        );
        this.logger.log(
          `WayForPay payment approved: orderReference=${orderReference}, paymentAttemptId=${paymentAttempt.id}`,
        );
      }
    } else {
      paymentAttempt.status = PaymentAttemptStatus.Failed;
      await this.paymentAttemptRepository.save(paymentAttempt);
      await this.activity.track(
        paymentAttempt.user,
        'payment',
        'wayforpay_payment_failed',
        {
          paymentAttemptId: paymentAttempt.id,
          orderReference,
          transactionStatus: payload.transactionStatus,
          reasonCode: payload.reasonCode,
          amount: paymentAttempt.amount,
          currency: paymentAttempt.currency,
          productId: paymentAttempt.productId,
        },
      );
      this.logger.warn(
        `WayForPay payment failed: orderReference=${orderReference}, status=${String(
          payload.transactionStatus ?? '',
        )}, reasonCode=${String(payload.reasonCode ?? '')}`,
      );
    }

    return this.wayForPay.buildWebhookResponse(orderReference);
  }

  async markAbandonedOlderThan(minutes: number): Promise<PaymentAttempt[]> {
    const threshold = new Date(Date.now() - minutes * 60 * 1000);
    const pendingAttempts = await this.paymentAttemptRepository.find({
      where: {
        status: PaymentAttemptStatus.Pending,
        createdAt: LessThan(threshold),
      },
      relations: { user: true, product: true },
      take: 50,
      order: { createdAt: 'ASC' },
    });

    const abandoned: PaymentAttempt[] = [];

    for (const paymentAttempt of pendingAttempts) {
      paymentAttempt.status = PaymentAttemptStatus.Abandoned;
      paymentAttempt.abandonedAt = new Date();
      const saved = await this.paymentAttemptRepository.save(paymentAttempt);
      abandoned.push(saved);
    }

    return abandoned;
  }

  private isMockMode(): boolean {
    return this.config.get<string>('PAYMENT_MODE', 'wayforpay') === 'mock';
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
