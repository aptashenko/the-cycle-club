import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentAttempt } from './payment-attempt.entity';

export type WayForPayWebhookPayload = {
  merchantAccount?: string;
  orderReference?: string;
  amount?: string | number;
  currency?: string;
  authCode?: string;
  cardPan?: string;
  transactionStatus?: string;
  reasonCode?: string | number;
  merchantSignature?: string;
  transactionId?: string;
  paymentSystem?: string;
  [key: string]: unknown;
};

type CheckoutFields = Record<string, string | string[]>;

@Injectable()
export class WayForPayService {
  private readonly payUrl = 'https://secure.wayforpay.com/pay';

  constructor(private readonly config: ConfigService) {}

  buildCheckoutFields(paymentAttempt: PaymentAttempt): CheckoutFields {
    const merchantAccount = this.config.getOrThrow<string>(
      'WAYFORPAY_MERCHANT_ACCOUNT',
    );
    const merchantDomainName = this.config.getOrThrow<string>(
      'WAYFORPAY_MERCHANT_DOMAIN',
    );
    const orderDate = Math.floor(paymentAttempt.createdAt.getTime() / 1000);
    const productName = [paymentAttempt.product.title];
    const productCount = ['1'];
    const productPrice = [paymentAttempt.amount];

    const signature = this.createSignature([
      merchantAccount,
      merchantDomainName,
      paymentAttempt.providerOrderId,
      String(orderDate),
      paymentAttempt.amount,
      paymentAttempt.currency,
      productName.join(';'),
      productCount.join(';'),
      productPrice.join(';'),
    ]);

    return {
      merchantAccount,
      merchantDomainName,
      merchantSignature: signature,
      merchantTransactionSecureType: 'AUTO',
      orderReference: paymentAttempt.providerOrderId,
      orderDate: String(orderDate),
      amount: paymentAttempt.amount,
      currency: paymentAttempt.currency,
      'productName[]': productName,
      'productCount[]': productCount,
      'productPrice[]': productPrice,
      serviceUrl: `${this.config.getOrThrow<string>('APP_URL')}/payments/wayforpay/webhook`,
      returnUrl: `${this.config.getOrThrow<string>('APP_URL')}/payments/wayforpay/return/${paymentAttempt.id}`,
      clientFirstName: paymentAttempt.user.firstName ?? 'Telegram',
      clientLastName: paymentAttempt.user.lastName ?? 'User',
    };
  }

  renderCheckoutForm(paymentAttempt: PaymentAttempt): string {
    const fields = this.buildCheckoutFields(paymentAttempt);
    const inputs = Object.entries(fields)
      .flatMap(([name, value]) =>
        Array.isArray(value)
          ? value.map((item) => this.input(name, item))
          : [this.input(name, value)],
      )
      .join('\n');

    return [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"><title>WayForPay</title></head>',
      '<body>',
      '<form id="payment-form" method="POST" action="https://secure.wayforpay.com/pay">',
      inputs,
      '<button type="submit">Перейти к оплате</button>',
      '</form>',
      '<script>document.getElementById("payment-form").submit();</script>',
      '</body></html>',
    ].join('');
  }

  verifyWebhook(payload: WayForPayWebhookPayload): boolean {
    if (!payload.merchantSignature) {
      return false;
    }

    const expected = this.createSignature([
      payload.merchantAccount,
      payload.orderReference,
      payload.amount,
      payload.currency,
      payload.authCode,
      payload.cardPan,
      payload.transactionStatus,
      payload.reasonCode,
    ]);

    return expected === payload.merchantSignature;
  }

  isApproved(payload: WayForPayWebhookPayload): boolean {
    return (
      payload.transactionStatus === 'Approved' &&
      String(payload.reasonCode) === '1100'
    );
  }

  buildWebhookResponse(orderReference: string) {
    const time = Math.floor(Date.now() / 1000);
    const status = 'accept';

    return {
      orderReference,
      status,
      time,
      signature: this.createSignature([orderReference, status, time]),
    };
  }

  private createSignature(values: unknown[]): string {
    const secret = this.config.getOrThrow<string>('WAYFORPAY_SECRET_KEY');
    const signatureBase = values.map((value) => String(value ?? '')).join(';');

    return createHmac('md5', secret).update(signatureBase).digest('hex');
  }

  private input(name: string, value: string) {
    return `<input type="hidden" name="${this.escape(name)}" value="${this.escape(value)}">`;
  }

  private escape(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
