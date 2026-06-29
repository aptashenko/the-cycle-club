import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminBotModule } from './admin-bot/admin-bot.module';
import { BotModule } from './bot/bot.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { SupportModule } from './support/support.module';
import { UsersModule } from './users/users.module';
import { buildDataSourceOptions } from './database/typeorm.config';
import { FilesController } from './files/files.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...buildDataSourceOptions(
          config.getOrThrow<string>('DATABASE_URL'),
          config.get<string>('DATABASE_MIGRATIONS_RUN', 'true') === 'true',
        ),
      }),
    }),
    UsersModule,
    ProductsModule,
    SubscriptionsModule,
    NotificationsModule,
    PaymentsModule,
    SupportModule,
    BotModule,
    AdminBotModule,
    SchedulerModule,
  ],
  controllers: [FilesController],
})
export class AppModule {}
