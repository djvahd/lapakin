CREATE TABLE "inv_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"unit" varchar(20) DEFAULT 'pcs' NOT NULL,
	"sale_price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"cost_price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"track_stock" boolean DEFAULT true NOT NULL,
	"reorder_level" numeric(14, 3),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "inv_products_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "inv_products_prices_check" CHECK ("inv_products"."sale_price" >= 0 and "inv_products"."cost_price" >= 0),
	CONSTRAINT "inv_products_reorder_check" CHECK ("inv_products"."reorder_level" is null or "inv_products"."reorder_level" >= 0)
);
--> statement-breakpoint
ALTER TABLE "inv_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inv_stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"kind" varchar(12) NOT NULL,
	"note" varchar(500),
	"reference_type" varchar(30),
	"reference_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inv_stock_movements_kind_check" CHECK ("inv_stock_movements"."kind" in ('receipt', 'issue', 'adjustment', 'sale', 'return')),
	CONSTRAINT "inv_stock_movements_sign_check" CHECK (("inv_stock_movements"."kind" in ('receipt', 'return') and "inv_stock_movements"."quantity" > 0) or ("inv_stock_movements"."kind" in ('issue', 'sale') and "inv_stock_movements"."quantity" < 0) or ("inv_stock_movements"."kind" = 'adjustment' and "inv_stock_movements"."quantity" <> 0))
);
--> statement-breakpoint
ALTER TABLE "inv_stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inv_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(100),
	"sku" varchar(64),
	"sale_price" numeric(14, 2),
	"cost_price" numeric(14, 2),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "inv_variants_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "inv_variants_prices_check" CHECK (("inv_variants"."sale_price" is null or "inv_variants"."sale_price" >= 0) and ("inv_variants"."cost_price" is null or "inv_variants"."cost_price" >= 0))
);
--> statement-breakpoint
ALTER TABLE "inv_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inv_products" ADD CONSTRAINT "inv_products_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_products" ADD CONSTRAINT "inv_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_movements" ADD CONSTRAINT "inv_stock_movements_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_movements" ADD CONSTRAINT "inv_stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_stock_movements" ADD CONSTRAINT "inv_stock_movements_variant_fk" FOREIGN KEY ("variant_id","team_id") REFERENCES "public"."inv_variants"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_variants" ADD CONSTRAINT "inv_variants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inv_variants" ADD CONSTRAINT "inv_variants_product_fk" FOREIGN KEY ("product_id","team_id") REFERENCES "public"."inv_products"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inv_products_team_name_idx" ON "inv_products" USING btree ("team_id","name");--> statement-breakpoint
CREATE INDEX "inv_stock_movements_variant_idx" ON "inv_stock_movements" USING btree ("team_id","variant_id");--> statement-breakpoint
CREATE INDEX "inv_stock_movements_created_idx" ON "inv_stock_movements" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_variants_team_sku_unique" ON "inv_variants" USING btree ("team_id",lower("sku")) WHERE "inv_variants"."sku" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inv_variants_one_default_unique" ON "inv_variants" USING btree ("product_id") WHERE "inv_variants"."is_default";--> statement-breakpoint
CREATE INDEX "inv_variants_product_idx" ON "inv_variants" USING btree ("product_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inv_products" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inv_stock_movements" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "inv_variants" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);
--> statement-breakpoint
-- Buku besar stok hanya bertambah: aplikasi (lapakin_app) tidak boleh mengubah atau menghapus mutasi.
-- Koreksi dibuat sebagai mutasi baru (adjustment). Default privileges dari migrasi 0002 memberi DML penuh, jadi dicabut di sini.
REVOKE UPDATE, DELETE ON "inv_stock_movements" FROM lapakin_app;
