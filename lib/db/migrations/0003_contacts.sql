CREATE TABLE "contact_tag_links" (
	"contact_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	CONSTRAINT "contact_tag_links_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "contact_tag_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"color" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_id_team_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"kind" varchar(10) NOT NULL,
	"name" varchar(200) NOT NULL,
	"company_id" integer,
	"email" varchar(255),
	"phone" varchar(50),
	"address" text,
	"notes" text,
	"is_customer" boolean DEFAULT false NOT NULL,
	"is_supplier" boolean DEFAULT false NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "contacts_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "contacts_kind_check" CHECK ("contacts"."kind" in ('person', 'company')),
	CONSTRAINT "contacts_company_only_for_person" CHECK ("contacts"."kind" = 'person' or "contacts"."company_id" is null)
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_tag_links" ADD CONSTRAINT "contact_tag_links_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_links" ADD CONSTRAINT "contact_tag_links_contact_fk" FOREIGN KEY ("contact_id","team_id") REFERENCES "public"."contacts"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag_links" ADD CONSTRAINT "contact_tag_links_tag_fk" FOREIGN KEY ("tag_id","team_id") REFERENCES "public"."contact_tags"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_fk" FOREIGN KEY ("company_id","team_id") REFERENCES "public"."contacts"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_tags_team_name_unique" ON "contact_tags" USING btree ("team_id",lower("name"));--> statement-breakpoint
CREATE INDEX "contacts_team_name_idx" ON "contacts" USING btree ("team_id","name");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_tag_links" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contact_tags" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "contacts" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);