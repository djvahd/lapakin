CREATE TABLE "bill_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"number" integer NOT NULL,
	"order_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"status" varchar(10) DEFAULT 'draft' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"notes" text,
	"issued_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bill_invoices_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "bill_invoices_status_check" CHECK ("bill_invoices"."status" in ('draft', 'issued', 'void')),
	CONSTRAINT "bill_invoices_due_check" CHECK ("bill_invoices"."due_date" >= "bill_invoices"."issue_date")
);
--> statement-breakpoint
ALTER TABLE "bill_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"order_line_id" integer NOT NULL,
	"description" varchar(300) NOT NULL,
	"position" integer NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "bill_lines_amounts_check" CHECK ("bill_lines"."quantity" > 0 and "bill_lines"."unit_price" >= 0 and "bill_lines"."discount_pct" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "bill_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"method" varchar(10) DEFAULT 'transfer' NOT NULL,
	"note" varchar(500),
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payments_amount_check" CHECK ("bill_payments"."amount" > 0),
	CONSTRAINT "bill_payments_method_check" CHECK ("bill_payments"."method" in ('transfer', 'cash', 'card', 'other'))
);
--> statement-breakpoint
ALTER TABLE "bill_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_invoices" ADD CONSTRAINT "bill_invoices_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_invoices" ADD CONSTRAINT "bill_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_invoices" ADD CONSTRAINT "bill_invoices_order_fk" FOREIGN KEY ("order_id","team_id") REFERENCES "public"."sales_orders"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_invoices" ADD CONSTRAINT "bill_invoices_contact_fk" FOREIGN KEY ("contact_id","team_id") REFERENCES "public"."contacts"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_invoice_fk" FOREIGN KEY ("invoice_id","team_id") REFERENCES "public"."bill_invoices"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_order_line_fk" FOREIGN KEY ("order_line_id","team_id") REFERENCES "public"."sales_lines"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_invoice_fk" FOREIGN KEY ("invoice_id","team_id") REFERENCES "public"."bill_invoices"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_invoices_team_number_unique" ON "bill_invoices" USING btree ("team_id","number");--> statement-breakpoint
CREATE INDEX "bill_invoices_team_status_idx" ON "bill_invoices" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "bill_invoices_order_idx" ON "bill_invoices" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "bill_lines_invoice_idx" ON "bill_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "bill_lines_order_line_idx" ON "bill_lines" USING btree ("order_line_id");--> statement-breakpoint
CREATE INDEX "bill_payments_invoice_idx" ON "bill_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bill_invoices" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bill_lines" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "bill_payments" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
-- Pembayaran hanya bertambah: aplikasi (lapakin_app) tidak boleh mengubah atau menghapusnya. Salah catat dikoreksi
-- dengan membatalkan faktur (bila belum ada pembayaran) atau lewat penyesuaian manual oleh pemilik database.
REVOKE UPDATE, DELETE ON "bill_payments" FROM lapakin_app;
