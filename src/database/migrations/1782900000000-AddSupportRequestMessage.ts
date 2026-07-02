import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupportRequestMessage1782900000000
  implements MigrationInterface
{
  name = 'AddSupportRequestMessage1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "support_requests" ADD COLUMN IF NOT EXISTS "message" text',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "support_requests" DROP COLUMN IF EXISTS "message"',
    );
  }
}
