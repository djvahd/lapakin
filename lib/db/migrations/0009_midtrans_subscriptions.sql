CREATE TABLE "sub_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"order_id" varchar(50) NOT NULL,
	"plan" varchar(20) NOT NULL,
	"period" varchar(10) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"snap_token" text,
	"redirect_url" text,
	"payment_type" varchar(30),
	"paid_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_payments_status_check" CHECK ("sub_payments"."status" in ('pending', 'paid', 'failed', 'expired')),
	CONSTRAINT "sub_payments_period_check" CHECK ("sub_payments"."period" in ('month', 'year'))
);
--> statement-breakpoint
ALTER TABLE "sub_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "plan_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_payments" ADD CONSTRAINT "sub_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sub_payments_order_unique" ON "sub_payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sub_payments_team_idx" ON "sub_payments" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "sub_payments" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);