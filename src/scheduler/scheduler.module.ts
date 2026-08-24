import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PaymentAbandonmentJob } from './payment-abandonment.job';
import { SubscriptionExpirationJob } from './subscription-expiration.job';

@Module({
  imports: [PaymentsModule, SubscriptionsModule, NotificationsModule],
  providers: [
    PaymentAbandonmentJob,
    SubscriptionExpirationJob,
    // Subscription reminders are disabled: the bot should not notify users
    // about upcoming subscription expiration.
    // SubscriptionReminderJob,
  ],
})
export class SchedulerModule {}
