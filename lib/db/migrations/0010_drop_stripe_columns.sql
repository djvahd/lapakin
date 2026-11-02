-- DESTRUKTIF dan tidak bisa dibatalkan. Urutan rilis KEBALIKAN dari biasanya:
--   1. deploy kode yang sudah tidak memakai kolom stripe_* (main setelah PR Midtrans), lalu
--   2. terapkan migrasi ini.
-- Menerapkannya sebelum kode lama diganti membuat query `teams` kode lama gagal. Pastikan kolom itu memang kosong:
--   select count(*) from teams where stripe_customer_id is not null or stripe_subscription_id is not null or stripe_product_id is not null;
ALTER TABLE "teams" DROP CONSTRAINT "teams_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "teams" DROP COLUMN "stripe_product_id";