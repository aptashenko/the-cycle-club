import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotFlowService } from '../bot/bot-flow.service';
import { InviteLinksModule } from '../invite-links/invite-links.module';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { TelegramApiService } from '../notifications/telegram-api.service';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';
import { AdminBotController } from './admin-bot.controller';
import { AdminBotPollingService } from './admin-bot-polling.service';
import { AdminBotService } from './admin-bot.service';
import { AdminTelegramApiService } from './admin-telegram-api.service';
import { BroadcastCampaign } from './broadcast-campaign.entity';
import { BroadcastDelivery } from './broadcast-delivery.entity';
import { BroadcastMediaAsset } from './broadcast-media-asset.entity';

@Module({
  imports: [
    InviteLinksModule,
    TypeOrmModule.forFeature([
      User,
      Product,
      Subscription,
      PaymentAttempt,
      SupportRequest,
      UserActivityEvent,
      BroadcastMediaAsset,
      BroadcastCampaign,
      BroadcastDelivery,
    ]),
  ],
  controllers: [AdminBotController],
  providers: [
    AdminBotService,
    AdminBotPollingService,
    AdminTelegramApiService,
    TelegramApiService,
    BotFlowService,
  ],
})
export class AdminBotModule {}
