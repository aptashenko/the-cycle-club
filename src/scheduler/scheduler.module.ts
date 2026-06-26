import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentAbandonmentJob } from './payment-abandonment.job';

@Module({
  imports: [PaymentsModule],
  providers: [PaymentAbandonmentJob],
})
export class SchedulerModule {}
