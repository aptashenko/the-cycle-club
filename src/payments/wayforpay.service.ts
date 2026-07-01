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
      '<html lang="ru">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>The Cycle - Payment</title>',
      '<style>',
      ':root{color-scheme:light;--ink:#1f2933;--muted:#667085;--line:#e6e0d8;--paper:#fffaf4;--accent:#b85c7a;--accent-dark:#8f3454}',
      '*{box-sizing:border-box}',
      'body{margin:0;min-height:100vh;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7efe7;color:var(--ink);display:grid;place-items:center;padding:24px}',
      'main{width:min(520px,100%);background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:36px 32px;text-align:center;box-shadow:0 18px 55px rgba(59,43,32,.12)}',
      '.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent-dark);font-weight:700;margin-bottom:26px}',
      '.loader{width:62px;height:62px;border-radius:50%;border:5px solid #eaded2;border-top-color:var(--accent);margin:0 auto 24px;animation:spin .85s linear infinite}',
      '@keyframes spin{to{transform:rotate(360deg)}}',
      'h1{font-size:30px;line-height:1.14;margin:0 0 12px;font-weight:750;letter-spacing:0}',
      'p{font-size:16px;line-height:1.56;margin:0;color:var(--muted)}',
      '.summary{margin:22px 0 0;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:#fffdf9;display:flex;justify-content:space-between;gap:16px;text-align:left}',
      '.summary span{color:var(--muted)}',
      '.summary strong{white-space:nowrap}',
      'form{margin-top:26px}',
      'button{appearance:none;border:0;border-radius:10px;padding:13px 18px;font:inherit;font-weight:700;background:var(--accent);color:white;cursor:pointer}',
      'button:hover{background:var(--accent-dark)}',
      '.fallback{opacity:0;animation:show 1ms linear 2.8s forwards}',
      '@keyframes show{to{opacity:1}}',
      '@media (max-width:480px){body{padding:16px}main{padding:28px 22px;border-radius:14px}h1{font-size:25px}.summary{display:block}.summary strong{display:block;margin-top:4px}button{width:100%}}',
      '</style>',
      '</head>',
      '<body>',
      '<main>',
      '<div class="brand">Niсolaeva | nutrition</div>',
      '<div class="loader" aria-hidden="true"></div>',
      '<h1>Переходим к оплате</h1>',
      '<p>Сейчас откроется защищенная платежная страница WayForPay.</p>',
      '<div class="summary">',
      `<span>${this.escape(paymentAttempt.product.title)}</span>`,
      `<strong>${this.escape(paymentAttempt.amount)} ${this.escape(paymentAttempt.currency)}</strong>`,
      '</div>',
      '<form id="payment-form" method="POST" action="https://secure.wayforpay.com/pay">',
      inputs,
      '<button class="fallback" type="submit">Перейти к оплате</button>',
      '</form>',
      '</main>',
      '<script>window.setTimeout(function(){document.getElementById("payment-form").submit()},600);</script>',
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
