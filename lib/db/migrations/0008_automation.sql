CREATE TABLE "auto_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(500),
	"link" varchar(300),
	"rule_id" integer,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auto_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"event" varchar(50) NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action" varchar(30) NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auto_rules_id_team_unique" UNIQUE("id","team_id")
);
--> statement-breakpoint
ALTER TABLE "auto_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auto_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"rule_id" integer NOT NULL,
	"event" varchar(50) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" varchar(200),
	"status" varchar(10) DEFAULT 'running' NOT NULL,
	"error" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auto_runs_status_check" CHECK ("auto_runs"."status" in ('running', 'ok', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "auto_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auto_notifications" ADD CONSTRAINT "auto_notifications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_notifications" ADD CONSTRAINT "auto_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_rules" ADD CONSTRAINT "auto_rules_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_rules" ADD CONSTRAINT "auto_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_runs" ADD CONSTRAINT "auto_runs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_runs" ADD CONSTRAINT "auto_runs_rule_fk" FOREIGN KEY ("rule_id","team_id") REFERENCES "public"."auto_rules"("id","team_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_notifications_user_idx" ON "auto_notifications" USING btree ("team_id","user_id","read_at");--> statement-breakpoint
CREATE INDEX "auto_rules_team_event_idx" ON "auto_rules" USING btree ("team_id","event");--> statement-breakpoint
CREATE UNIQUE INDEX "auto_runs_rule_dedupe_unique" ON "auto_runs" USING btree ("rule_id","dedupe_key") WHERE "auto_runs"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "auto_runs_team_created_idx" ON "auto_runs" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "auto_notifications" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "auto_rules" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "auto_runs" AS PERMISSIVE FOR ALL TO public USING (team_id = nullif(current_setting('app.team_id', true), '')::int) WITH CHECK (team_id = nullif(current_setting('app.team_id', true), '')::int);