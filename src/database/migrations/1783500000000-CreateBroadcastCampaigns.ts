import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBroadcastCampaigns1783500000000 implements MigrationInterface {
  name = 'CreateBroadcastCampaigns1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_campaigns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "text" text NOT NULL,
        "button_text" text,
        "button_url" text,
        "button_callback_data" text,
        "media_type" character varying(32),
        "media_key" text,
        "created_by_telegram_id" bigint NOT NULL,
        "recipients_count" integer NOT NULL DEFAULT 0,
        "sent_count" integer NOT NULL DEFAULT 0,
        "failed_count" integer NOT NULL DEFAULT 0,
        "skipped_count" integer NOT NULL DEFAULT 0,
        "delete_requested_at" TIMESTAMP WITH TIME ZONE,
        "deleted_count" integer NOT NULL DEFAULT 0,
        "delete_failed_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_campaigns" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_campaigns_created_at"
      ON "broadcast_campaigns" ("created_at")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "broadcast_id" uuid NOT NULL,
        "telegram_id" bigint NOT NULL,
        "message_id" integer NOT NULL,
        "message_type" character varying(32) NOT NULL,
        "sent_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "delete_error" text,
        CONSTRAINT "PK_broadcast_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "FK_broadcast_deliveries_broadcast_id" FOREIGN KEY ("broadcast_id") REFERENCES "broadcast_campaigns"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_deliveries_broadcast_deleted"
      ON "broadcast_deliveries" ("broadcast_id", "deleted_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_broadcast_deliveries_broadcast_deleted"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "broadcast_deliveries"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_broadcast_campaigns_created_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "broadcast_campaigns"');
  }
}
