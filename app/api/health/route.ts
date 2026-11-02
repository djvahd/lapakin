import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';

// Pemeriksaan kesehatan untuk pemantau waktu aktif (uptime monitor): aplikasi hidup dan database
// bisa dijangkau. Tanpa autentikasi dan tanpa detail (tidak membocorkan versi atau galat).
const headers = { 'cache-control': 'no-store' };

async function check() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: 'ok' }, { headers });
  } catch (e) {
    console.error(JSON.stringify({ level: 'error', event: 'health_check_failed', message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' }));
    return Response.json({ status: 'error' }, { status: 503, headers });
  }
}

export const GET = check;
export const HEAD = check;
