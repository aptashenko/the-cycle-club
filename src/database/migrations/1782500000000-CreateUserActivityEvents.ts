import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserActivityEvents1782500000000 implements MigrationInterface {
  name = 'CreateUserActivityEvents1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_activity_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "telegram_id" bigint NOT NULL,
        "event_type" character varying NOT NULL,
        "event_name" character varying NOT NULL,
        "payload" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_activity_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_activity_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_user_activity_events_user_created_at" ON "user_activity_events" ("user_id", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_user_activity_events_telegram_created_at" ON "user_activity_events" ("telegram_id", "created_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_user_activity_events_telegram_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_user_activity_events_user_created_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "user_activity_events"');
  }
}
