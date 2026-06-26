import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentService } from '../payments/payment.service';

@Injectable()
export class PaymentAbandonmentJob {
  private readonly logger = new Logger(PaymentAbandonmentJob.name);

  constructor(private readonly payments: PaymentService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async markAbandonedPayments() {
    const abandoned = await this.payments.markAbandonedOlderThan(45);

    if (abandoned.length > 0) {
      this.logger.log(`Marked ${abandoned.length} payment attempts as abandoned`);
    }
  }
}
