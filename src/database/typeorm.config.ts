import { DataSourceOptions } from 'typeorm';
import { PaymentAttempt } from '../payments/payment-attempt.entity';
import { Product } from '../products/product.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SupportRequest } from '../support/support-request.entity';
import { UserActivityEvent } from '../user-activity/user-activity-event.entity';
import { User } from '../users/user.entity';

export const databaseEntities = [
  User,
  Product,
  Subscription,
  PaymentAttempt,
  SupportRequest,
  UserActivityEvent,
];

export function buildDataSourceOptions(
  databaseUrl: string,
  migrationsRun = false,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: databaseEntities,
    migrations: [`${__dirname}/migrations/*{.ts,.js}`],
    migrationsRun,
    synchronize: false,
  };
}
