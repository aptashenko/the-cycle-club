import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1782432000000 implements MigrationInterface {
  name = 'InitialSchema1782432000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscriptions_status_enum') THEN
          CREATE TYPE "public"."subscriptions_status_enum" AS ENUM('pending', 'active', 'expired', 'cancelled');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempts_status_enum') THEN
          CREATE TYPE "public"."payment_attempts_status_enum" AS ENUM('pending', 'paid', 'failed', 'abandoned');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_attempts_provider_enum') THEN
          CREATE TYPE "public"."payment_attempts_provider_enum" AS ENUM('wayforpay', 'mock');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'support_requests_status_enum') THEN
          CREATE TYPE "public"."support_requests_status_enum" AS ENUM('open', 'in_progress', 'resolved');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "telegramId" bigint NOT NULL,
        "username" character varying,
        "firstName" character varying,
        "lastName" character varying,
        "languageCode" character varying,
        "membershipStatus" character varying NOT NULL DEFAULT 'none',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_telegramId" UNIQUE ("telegramId"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "slug" character varying NOT NULL,
        "title" character varying NOT NULL,
        "description" text NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'UAH',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_products_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_products" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "status" "public"."subscriptions_status_enum" NOT NULL DEFAULT 'pending',
        "starts_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_subscriptions_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" character varying NOT NULL DEFAULT 'UAH',
        "status" "public"."payment_attempts_status_enum" NOT NULL DEFAULT 'pending',
        "provider" "public"."payment_attempts_provider_enum" NOT NULL DEFAULT 'wayforpay',
        "provider_order_id" character varying NOT NULL,
        "provider_transaction_id" character varying,
        "payment_url" text NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "abandoned_at" TIMESTAMP WITH TIME ZONE,
        "raw_payload" jsonb,
        CONSTRAINT "UQ_payment_attempts_provider_order_id" UNIQUE ("provider_order_id"),
        CONSTRAINT "PK_payment_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_attempts_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_payment_attempts_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "support_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "topic" character varying NOT NULL,
        "message" text,
        "status" "public"."support_requests_status_enum" NOT NULL DEFAULT 'open',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "resolved_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_support_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_support_requests_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "support_requests"');
    await queryRunner.query('DROP TABLE IF EXISTS "payment_attempts"');
    await queryRunner.query('DROP TABLE IF EXISTS "subscriptions"');
    await queryRunner.query('DROP TABLE IF EXISTS "products"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."support_requests_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."payment_attempts_provider_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."payment_attempts_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."subscriptions_status_enum"',
    );
  }
}
