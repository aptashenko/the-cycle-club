import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLiveEventRegistrations1783200000000 implements MigrationInterface {
  name = 'CreateLiveEventRegistrations1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'live_event_registrations_status_enum') THEN
          CREATE TYPE "public"."live_event_registrations_status_enum" AS ENUM('registered', 'cancelled');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "live_event_registrations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "event_slug" character varying NOT NULL,
        "telegram_id" bigint NOT NULL,
        "telegram_username" character varying,
        "status" "public"."live_event_registrations_status_enum" NOT NULL DEFAULT 'registered',
        "joined_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_live_event_registrations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_live_event_registrations_event_user" UNIQUE ("event_slug", "user_id"),
        CONSTRAINT "FK_live_event_registrations_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_live_event_registrations_event_created_at" ON "live_event_registrations" ("event_slug", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_live_event_registrations_event_created_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "live_event_registrations"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."live_event_registrations_status_enum"',
    );
  }
}
