import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBroadcastMediaAssets1783400000000 implements MigrationInterface {
  name = 'CreateBroadcastMediaAssets1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "broadcast_media_assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying(32) NOT NULL,
        "key" character varying(64) NOT NULL,
        "admin_file_id" text NOT NULL,
        "file_unique_id" text,
        "file_data" bytea NOT NULL,
        "file_size" integer,
        "duration" integer,
        "length" integer,
        "width" integer,
        "height" integer,
        "created_by_telegram_id" bigint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_media_assets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_broadcast_media_assets_key" UNIQUE ("key")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_broadcast_media_assets_type_created_at"
      ON "broadcast_media_assets" ("type", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_broadcast_media_assets_type_created_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "broadcast_media_assets"');
  }
}
