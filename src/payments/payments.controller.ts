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
      '<html><head><meta charset="utf-8"><title>Payment</title></head>',
      '<body><p>Спасибо. Статус оплаты будет подтвержден автоматически.</p></body></html>',
    ].join('');
  }

  @Post('wayforpay/webhook')
  handleWebhook(@Body() payload: WayForPayWebhookPayload) {
    return this.payments.handleWayForPayWebhook(payload);
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
}
