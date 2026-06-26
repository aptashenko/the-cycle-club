import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Subscription } from './subscription.entity';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, User])],
  providers: [SubscriptionService],
  exports: [SubscriptionService, TypeOrmModule],
})
export class SubscriptionsModule {}
