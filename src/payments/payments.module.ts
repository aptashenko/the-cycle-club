import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentAttempt } from './payment-attempt.entity';
import { PaymentService } from './payment.service';
import { PaymentsController } from './payments.controller';
import { WayForPayService } from './wayforpay.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentAttempt]),
    SubscriptionsModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentService, WayForPayService],
  exports: [PaymentService, WayForPayService, TypeOrmModule],
})
export class PaymentsModule {}
