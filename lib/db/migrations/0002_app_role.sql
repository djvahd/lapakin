-- Role aplikasi untuk RLS. Role bawaan Neon (neondb_owner) memiliki BYPASSRLS dan memiliki
-- semua tabel, jadi RLS tidak berlaku baginya. Aplikasi harus tersambung sebagai lapakin_app.
-- Password tidak disimpan di repo: setel dengan `node scripts/set-app-role-password.mjs`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lapakin_app') THEN
    CREATE ROLE lapakin_app LOGIN NOBYPASSRLS;
  END IF;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO lapakin_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lapakin_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lapakin_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lapakin_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lapakin_app;
