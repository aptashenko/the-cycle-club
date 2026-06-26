import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SupportModule } from '../support/support.module';
import { UserActivityModule } from '../user-activity/user-activity.module';
import { UsersModule } from '../users/users.module';
import { BotController } from './bot.controller';
import { BotPollingService } from './bot-polling.service';
import { BotService } from './bot.service';

@Module({
  imports: [
    NotificationsModule,
    UsersModule,
    ProductsModule,
    SubscriptionsModule,
    PaymentsModule,
    SupportModule,
    UserActivityModule,
  ],
  controllers: [BotController],
  providers: [BotService, BotPollingService],
})
export class BotModule {}
