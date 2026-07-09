import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductIncludedInSubscription1783000000000 implements MigrationInterface {
  name = 'AddProductIncludedInSubscription1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "included_in_subscription" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "included_in_subscription"
    `);
  }
}
