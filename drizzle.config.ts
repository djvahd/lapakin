import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrasi memakai role pemilik (MIGRATION_URL); aplikasi memakai role lapakin_app (POSTGRES_URL).
    url: (process.env.MIGRATION_URL ?? process.env.POSTGRES_URL)!,
  },
} satisfies Config;
