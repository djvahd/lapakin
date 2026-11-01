CREATE TABLE "sales_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"delivered_at" timestamp DEFAULT now() NOT NULL,
	"note" varchar(500),
	"created_by" integer,
	CONSTRAINT "sales_deliveries_id_team_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
ALTER TABLE "sales_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_delivery_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"delivery_id" integer NOT NULL,
	"order_line_id" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "sales_delivery_lines_quantity_check" CHECK ("sales_delivery_lines"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "sales_delivery_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"variant_id" integer,
	"description" varchar(300) NOT NULL,
	"position" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "sales_lines_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "sales_lines_amounts_check" CHECK ("sales_lines"."quantity" > 0 and "sales_lines"."unit_price" >= 0 and "sales_lines"."discount_pct" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "sales_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"number" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"opportunity_id" integer,
	"status" varchar(12) DEFAULT 'draft' NOT NULL,
	"issue_date" date NOT NULL,
	"valid_until" date,
	"notes" text,
	"confirmed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "sales_orders_status_check" CHECK ("sales_orders"."status" in ('draft', 'sent', 'rejected', 'confirmed', 'cancelled')),
	CONSTRAINT "sales_orders_valid_until_check" CHECK ("sales_orders"."valid_until" is null or "sales_orders"."valid_until" >= "sales_orders"."issue_date")
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_deliveries" ADD CONSTRAINT "sales_deliveries_order_fk" FOREIGN KEY ("order_id","team_id") REFERENCES "public"."sales_orders"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_delivery_fk" FOREIGN KEY ("delivery_id","team_id") REFERENCES "public"."sales_deliveries"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_delivery_lines" ADD CONSTRAINT "sales_delivery_lines_line_fk" FOREIGN KEY ("order_line_id","team_id") REFERENCES "public"."sales_lines"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_order_fk" FOREIGN KEY ("order_id","team_id") REFERENCES "public"."sales_orders"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_variant_fk" FOREIGN KEY ("variant_id","team_id") REFERENCES "public"."inv_variants"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_contact_fk" FOREIGN KEY ("contact_id","team_id") REFERENCES "public"."contacts"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_opportunity_fk" FOREIGN KEY ("opportunity_id","team_id") REFERENCES "public"."crm_opportunities"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_deliveries_order_idx" ON "sales_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_delivery_lines_delivery_idx" ON "sales_delivery_lines" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "sales_delivery_lines_line_idx" ON "sales_delivery_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "sales_lines_order_idx" ON "sales_lines" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_team_number_unique" ON "sales_orders" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "sales_orders_team_status_idx" ON "sales_orders" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "sales_orders_team_contact_idx" ON "sales_orders" USING btree ("team_id","contact_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_deliveries" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_delivery_lines" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_lines" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sales_orders" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);