import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramAttributions1783100000000 implements MigrationInterface {
  name = 'CreateTelegramAttributions1783100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_attributions" (
        "id" character varying(64) NOT NULL,
        "utm_source" character varying,
        "utm_medium" character varying,
        "utm_campaign" character varying,
        "utm_content" character varying,
        "utm_term" character varying,
        "referrer" character varying,
        "landing_url" text,
        "ip" character varying,
        "user_agent" text,
        "user_id" uuid,
        "telegram_id" bigint,
        "telegram_username" character varying,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telegram_attributions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_telegram_attributions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_attributions_created_at" ON "telegram_attributions" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_telegram_attributions_telegram_id" ON "telegram_attributions" ("telegram_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_telegram_attributions_telegram_id"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_telegram_attributions_created_at"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "telegram_attributions"');
  }
}
