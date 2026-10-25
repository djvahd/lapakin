import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL environment variable is not set');
}

// Driver HTTP Neon: tiap query adalah satu fetch, jadi aman di Cloudflare Workers
// (driver `postgres` gagal di workerd karena TLS-nya belum didukung).
export const db = drizzle(neon(process.env.POSTGRES_URL), { schema });
