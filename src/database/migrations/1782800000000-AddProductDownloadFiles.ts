import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductDownloadFiles1782800000000 implements MigrationInterface {
  name = 'AddProductDownloadFiles1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "download_files" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "download_files"
    `);
  }
}
