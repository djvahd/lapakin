import { getTenantContext } from '@/lib/auth/tenant';
import { countUnread } from '@/modules/automation/service';

// Jumlah notifikasi belum dibaca untuk lencana di menu; 0 bila belum masuk.
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) return Response.json({ count: 0 });
  return Response.json({ count: await countUnread(ctx.teamId, ctx.user.id) });
}
