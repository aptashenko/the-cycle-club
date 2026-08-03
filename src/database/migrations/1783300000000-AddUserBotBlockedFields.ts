import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserBotBlockedFields1783300000000
  implements MigrationInterface
{
  name = 'AddUserBotBlockedFields1783300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "bot_blocked_at" TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS "bot_last_error" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "bot_last_error",
      DROP COLUMN IF EXISTS "bot_blocked_at"
    `);
  }
}
