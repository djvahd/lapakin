import { timingSafeEqual } from 'node:crypto';
import { todayIn } from '@/modules/crm/format';
import { runDailyScan } from '@/modules/automation/scan';

// Dipanggil oleh Cron Trigger lewat worker.ts (bukan oleh pengguna). Dilindungi rahasia bersama
// CRON_SECRET; tanpa rahasia terpasang, endpoint menolak semua permintaan.
const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Cron is not configured' }, { status: 503 });

  const auth = request.headers.get('authorization') ?? '';
  if (!same(auth, `Bearer ${secret}`)) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await runDailyScan(todayIn());
  return Response.json(result);
}
