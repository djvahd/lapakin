import { db } from '@/lib/db/drizzle';
import { teams } from '@/lib/db/schema';
import { formatNumber } from '@/modules/billing/audit-labels';
import { listQuerySchema as invoiceQuery } from '@/modules/billing/schemas';
import { listInvoices } from '@/modules/billing/service';
import { todayIn } from '@/modules/crm/format';
import { listFollowUps } from '@/modules/crm/service';
import { getSubscription } from '@/lib/payments/subscription';
import { emit, listRules } from './service';

// Pemindai terjadwal: peristiwa berbasis waktu ("faktur lewat jatuh tempo") tidak terjadi lewat
// tindakan pengguna, jadi pekerjaan harian mencarinya lalu memanggil emit(). Pengingat diulang
// paling cepat seminggu sekali per hal dan per aturan (dedupeKey memuat nomor minggu keterlambatan).

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / DAY);

export type ScanResult = { teams: number; emitted: number; failed: number };

// Faktur terbit yang masih punya sisa dan lewat jatuh tempo.
export async function scanOverdueInvoices(teamId: number, today: string) {
  const out = { emitted: 0, failed: 0 };
  for (let page = 1; ; page++) {
    const res = await listInvoices(teamId, invoiceQuery.parse({ payment: 'overdue', today, page, pageSize: 100 }));
    for (const inv of res.items) {
      const daysOverdue = daysBetween(inv.dueDate, today);
      const r = await emit(teamId, 'invoice.overdue', {
        invoiceId: inv.id,
        number: formatNumber(inv.number),
        contact: inv.contactName ?? '',
        balance: inv.balance,
        dueDate: inv.dueDate,
        daysOverdue,
        dedupeKey: `invoice:${inv.id}:w${Math.floor(daysOverdue / 7)}`,
      });
      out.emitted += r.ok;
      out.failed += r.failed;
    }
    if (page * res.pageSize >= res.total) break;
  }
  return out;
}

// Tindak lanjut CRM yang belum selesai dan lewat tanggalnya. `userId` = penanggung jawab, untuk
// aturan dengan penerima "orang yang bersangkutan".
export async function scanOverdueFollowUps(teamId: number, today: string) {
  const out = { emitted: 0, failed: 0 };
  const items = await listFollowUps(teamId, { limit: 500 });
  for (const f of items) {
    if (f.dueDate >= today) continue;
    const daysOverdue = daysBetween(f.dueDate, today);
    const r = await emit(teamId, 'crm.followup_overdue', {
      activityId: f.id,
      summary: f.summary,
      opportunityId: f.opportunityId,
      opportunity: f.opportunityTitle,
      dueDate: f.dueDate,
      daysOverdue,
      ...(f.assignedTo ? { userId: f.assignedTo } : {}),
      dedupeKey: `followup:${f.id}:w${Math.floor(daysOverdue / 7)}`,
    });
    out.emitted += r.ok;
    out.failed += r.failed;
  }
  return out;
}

// Paket Pro yang segera berakhir. `daysLeft` dihitung dari tanggal hari ini (WIB) ke tanggal berakhir;
// kunci dedupe memuat tanggal berakhir, jadi satu pengingat per aturan untuk tiap masa berlaku.
export async function scanExpiringSubscription(teamId: number, today: string) {
  const out = { emitted: 0, failed: 0 };
  const sub = await getSubscription(teamId);
  if (!sub.active || !sub.expiresAt) return out;
  const expiresOn = todayIn('Asia/Jakarta', sub.expiresAt);
  const r = await emit(teamId, 'subscription.expiring', {
    plan: sub.plan,
    expiresOn,
    daysLeft: daysBetween(today, expiresOn),
    dedupeKey: `subscription:${teamId}:${expiresOn}`,
  });
  out.emitted += r.ok;
  out.failed += r.failed;
  return out;
}

// Memindai satu toko bila punya aturan aktif untuk peristiwa terjadwal; selain itu dilewati murah.
export async function scanTeam(teamId: number, today: string) {
  // Aturan hanya berjalan selama paket Pro aktif; setelah habis aturan tetap tersimpan tetapi diam.
  if (!(await getSubscription(teamId)).active) return { emitted: 0, failed: 0 };
  const rules = (await listRules(teamId)).filter((r) => r.active);
  const wants = (event: string) => rules.some((r) => r.event === event);
  const total = { emitted: 0, failed: 0 };
  if (wants('invoice.overdue')) {
    const r = await scanOverdueInvoices(teamId, today);
    total.emitted += r.emitted;
    total.failed += r.failed;
  }
  if (wants('subscription.expiring')) {
    const r = await scanExpiringSubscription(teamId, today);
    total.emitted += r.emitted;
    total.failed += r.failed;
  }
  if (wants('crm.followup_overdue')) {
    const r = await scanOverdueFollowUps(teamId, today);
    total.emitted += r.emitted;
    total.failed += r.failed;
  }
  return total;
}

// Pekerjaan harian untuk semua toko. Satu toko yang gagal tidak menghentikan yang lain.
export async function runDailyScan(today: string): Promise<ScanResult> {
  const all = await db.select({ id: teams.id }).from(teams);
  const result: ScanResult = { teams: all.length, emitted: 0, failed: 0 };
  for (const t of all) {
    try {
      const r = await scanTeam(t.id, today);
      result.emitted += r.emitted;
      result.failed += r.failed;
    } catch (e) {
      result.failed++;
      console.error(`Automation scan failed for team ${t.id}:`, e);
    }
  }
  return result;
}
