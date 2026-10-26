CREATE TABLE "crm_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"opportunity_id" integer NOT NULL,
	"kind" varchar(10) NOT NULL,
	"summary" varchar(200) NOT NULL,
	"due_date" date NOT NULL,
	"assigned_to" integer,
	"done_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_activities_kind_check" CHECK ("crm_activities"."kind" in ('call', 'email', 'meeting', 'todo'))
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"contact_id" integer,
	"stage_id" integer NOT NULL,
	"expected_value" numeric(14, 2) DEFAULT 0 NOT NULL,
	"expected_close_date" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"owner_id" integer,
	"lost_reason" text,
	"notes" text,
	"closed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp,
	CONSTRAINT "crm_opportunities_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "crm_opportunities_value_check" CHECK ("crm_opportunities"."expected_value" >= 0),
	CONSTRAINT "crm_opportunities_priority_check" CHECK ("crm_opportunities"."priority" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "crm_opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "crm_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(50) NOT NULL,
	"position" integer NOT NULL,
	"kind" varchar(10) DEFAULT 'open' NOT NULL,
	"probability" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_stages_id_team_unique" UNIQUE("id","team_id"),
	CONSTRAINT "crm_stages_kind_check" CHECK ("crm_stages"."kind" in ('open', 'won', 'lost')),
	CONSTRAINT "crm_stages_probability_check" CHECK ("crm_stages"."probability" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "crm_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_opportunity_fk" FOREIGN KEY ("opportunity_id","team_id") REFERENCES "public"."crm_opportunities"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_contact_fk" FOREIGN KEY ("contact_id","team_id") REFERENCES "public"."contacts"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_stage_fk" FOREIGN KEY ("stage_id","team_id") REFERENCES "public"."crm_stages"("id","team_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_stages" ADD CONSTRAINT "crm_stages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_activities_opportunity_idx" ON "crm_activities" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "crm_activities_team_due_idx" ON "crm_activities" USING btree ("team_id","due_date");--> statement-breakpoint
CREATE INDEX "crm_opportunities_team_stage_idx" ON "crm_opportunities" USING btree ("team_id","stage_id");--> statement-breakpoint
CREATE INDEX "crm_opportunities_team_owner_idx" ON "crm_opportunities" USING btree ("team_id","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_stages_team_name_unique" ON "crm_stages" USING btree ("team_id",lower("name"));--> statement-breakpoint
CREATE INDEX "crm_stages_team_position_idx" ON "crm_stages" USING btree ("team_id","position");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_activities" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_opportunities" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "crm_stages" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);