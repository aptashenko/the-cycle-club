import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductType1782700000000 implements MigrationInterface {
  name = 'AddProductType1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "type" character varying NOT NULL DEFAULT 'subscription'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "type"
    `);
  }
}
