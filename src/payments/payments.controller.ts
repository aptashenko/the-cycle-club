import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { WayForPayWebhookPayload } from './wayforpay.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Get('wayforpay/checkout/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderCheckout(@Param('id') id: string): Promise<string> {
    return this.payments.renderCheckout(id);
  }

  @Get('wayforpay/return/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  paymentReturn() {
    return this.renderPaymentReturn();
  }

  @Post('wayforpay/return/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  paymentReturnPost() {
    return this.renderPaymentReturn();
  }

  private renderPaymentReturn() {
    return [
      '<!doctype html>',
      '<html lang="ru">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>The Cycle - Payment</title>',
      '<style>',
      ':root{color-scheme:light;--ink:#1f2933;--muted:#667085;--line:#e6e0d8;--paper:#fffaf4;--accent:#b85c7a;--accent-dark:#8f3454;--ok:#2f8f69}',
      '*{box-sizing:border-box}',
      'body{margin:0;min-height:100vh;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f7efe7;color:var(--ink);display:grid;place-items:center;padding:24px}',
      'main{width:min(560px,100%);background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:36px 32px;box-shadow:0 18px 55px rgba(59,43,32,.12)}',
      '.brand{font-size:13px;text-transform:uppercase;letter-spacing:.12em;color:var(--accent-dark);font-weight:700;margin-bottom:24px}',
      '.mark{width:56px;height:56px;border-radius:50%;background:#e8f6ef;color:var(--ok);display:grid;place-items:center;font-size:30px;font-weight:700;margin-bottom:22px}',
      'h1{font-size:32px;line-height:1.12;margin:0 0 14px;font-weight:750;letter-spacing:0}',
      'p{font-size:16px;line-height:1.58;margin:0;color:var(--muted)}',
      '.note{margin-top:18px;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:#fffdf9;color:#475467}',
      '.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}',
      'button,a{appearance:none;border:0;border-radius:10px;padding:13px 18px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}',
      'button{background:var(--accent);color:white}',
      'button:hover{background:var(--accent-dark)}',
      'a{background:#fff;border:1px solid var(--line);color:var(--ink)}',
      '@media (max-width:480px){body{padding:16px}main{padding:28px 22px;border-radius:14px}h1{font-size:26px}.actions{display:grid}button,a{text-align:center;width:100%}}',
      '</style>',
      '</head>',
      '<body>',
      '<main>',
      '<div class="brand">Niсolaeva | nutrition</div>',
      '<div class="mark">✓</div>',
      '<h1>Спасибо, платеж отправлен на проверку</h1>',
      '<p>Мы подтверждаем оплату автоматически. Обычно это занимает несколько секунд.</p>',
      '<p class="note">Вернитесь в Telegram и откройте раздел “Мои подписки”. Если оплата прошла успешно, доступ появится там после подтверждения WayForPay.</p>',
      '<div class="actions">',
      '<button type="button" onclick="window.close()">Закрыть страницу</button>',
      '<a href="https://t.me/the_cycle_program_bot" rel="noopener">Открыть Telegram</a>',
      '</div>',
      '</main>',
      '</body>',
      '</html>',
    ].join('');
  }

  @Post('wayforpay/webhook')
  handleWebhook(@Body() payload: WayForPayWebhookPayload | string) {
    return this.payments.handleWayForPayWebhook(
      this.normalizeWayForPayPayload(payload),
    );
  }

  @Get('mock/checkout/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderMockCheckout(@Param('id') id: string): Promise<string> {
    return this.payments.renderMockCheckout(id);
  }

  @Post('mock/confirm/:id')
  @Header('Content-Type', 'text/html; charset=utf-8')
  confirmMockPayment(@Param('id') id: string): Promise<string> {
    return this.payments.confirmMockPayment(id);
  }

  private normalizeWayForPayPayload(
    payload: WayForPayWebhookPayload | string,
  ): WayForPayWebhookPayload {
    if (typeof payload === 'string') {
      return this.parseWayForPayPayloadString(payload);
    }

    if (payload.orderReference || payload.merchantSignature) {
      return payload;
    }

    const entries = Object.entries(payload);
    if (entries.length === 1) {
      const [key, value] = entries[0];

      if (typeof value === 'string' && value.trim()) {
        return this.parseWayForPayPayloadString(value);
      }

      return this.parseWayForPayPayloadString(key);
    }

    return payload;
  }

  private parseWayForPayPayloadString(value: string): WayForPayWebhookPayload {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }

    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed) as WayForPayWebhookPayload;
    }

    return Object.fromEntries(
      new URLSearchParams(trimmed),
    ) as WayForPayWebhookPayload;
  }
}
