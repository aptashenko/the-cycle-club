import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPhoneNumber1783600000000 implements MigrationInterface {
  name = 'AddUserPhoneNumber1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "phone_number" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "phone_number"
    `);
  }
}
