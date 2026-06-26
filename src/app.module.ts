import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BotModule } from './bot/bot.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SupportModule } from './support/support.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    UsersModule,
    ProductsModule,
    SubscriptionsModule,
    NotificationsModule,
    PaymentsModule,
    SupportModule,
    BotModule,
    SchedulerModule,
  ],
})
export class AppModule {}
