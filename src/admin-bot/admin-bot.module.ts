import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminBotController } from './admin-bot.controller';
import { AdminBotService } from './admin-bot.service';
import { AdminTelegramApiService } from './admin-telegram-api.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Subscription,
      PaymentAttempt,
      SupportRequest,
      UserActivityEvent,
    ]),
  ],
  controllers: [AdminBotController],
  providers: [AdminBotService, AdminTelegramApiService],
})
export class AdminBotModule {}
