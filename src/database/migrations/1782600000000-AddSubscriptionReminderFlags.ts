import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionReminderFlags1782600000000
  implements MigrationInterface
{
  name = 'AddSubscriptionReminderFlags1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "reminded_5_days_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "reminded_1_day_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_expiration_reminders"
      ON "subscriptions" ("status", "expires_at", "reminded_5_days_at", "reminded_1_day_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_subscriptions_expiration_reminders"
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      DROP COLUMN IF EXISTS "reminded_1_day_at",
      DROP COLUMN IF EXISTS "reminded_5_days_at"
    `);
  }
}
