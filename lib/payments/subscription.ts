import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { subPayments, teams, type SubPaymentStatus } from '@/lib/db/schema';
import { MidtransError, createSnapTransaction, outcomeOf, verifySignature, type Notification } from './midtrans';
import { PLANS, planPrice, type Period, type PlanKey } from './plans';

// Langganan dibayar per periode lewat Midtrans Snap. Tidak ada data kartu atau dana di sistem ini:
// hanya catatan pembayaran (sub_payments) dan tanggal berlaku paket pada teams.plan_expires_at.

export type Actor = { teamId: number; userId: number; email: string };

export type SubscriptionErrorCode = 'invalid_plan' | 'checkout_failed';

export class SubscriptionError extends Error {
  constructor(
    public code: SubscriptionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

// Awalan + id toko memungkinkan webhook (tanpa sesi) menentukan toko dari order_id.
const ORDER_RE = /^LPK-(\d+)-[a-z0-9]+$/;
export const makeOrderId = (teamId: number) =>
  `LPK-${teamId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const teamIdOfOrder = (orderId: string): number | null => {
  const m = ORDER_RE.exec(orderId);
  return m ? Number(m[1]) : null;
};

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export async function startCheckout(actor: Actor, plan: PlanKey, period: Period): Promise<string> {
  const { teamId, userId } = actor;
  if (!(plan in PLANS) || (period !== 'month' && period !== 'year')) {
    throw new SubscriptionError('invalid_plan', 'Unknown plan');
  }
  const amount = planPrice(plan, period);
  const orderId = makeOrderId(teamId);

  const [[payment]] = await withTenant(teamId, [
    db.insert(subPayments).values({ teamId, orderId, plan, period, amount, createdBy: userId }).returning(),
  ]);

  try {
    const snap = await createSnapTransaction({
      orderId,
      amount,
      itemName: `Lapakin ${PLANS[plan].name} (${period === 'year' ? '1 tahun' : '1 bulan'})`,
      email: actor.email,
      finishUrl: `${process.env.BASE_URL ?? ''}/dashboard?payment=finish`,
    });
    await withTenant(teamId, [
      db
        .update(subPayments)
        .set({ snapToken: snap.token, redirectUrl: snap.redirectUrl, updatedAt: new Date() })
        .where(and(eq(subPayments.id, payment.id), eq(subPayments.teamId, teamId))),
      auditEntry(teamId, userId, 'SUBSCRIPTION_CHECKOUT_STARTED', {
        entityType: 'sub_payment',
        entityId: payment.id,
        metadata: { plan, period, amount },
      }),
    ]);
    return snap.redirectUrl;
  } catch (e) {
    await withTenant(teamId, [
      db
        .update(subPayments)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(and(eq(subPayments.id, payment.id), eq(subPayments.teamId, teamId))),
    ]);
    const message = e instanceof MidtransError ? e.message : 'Could not start the payment';
    throw new SubscriptionError('checkout_failed', message);
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export type WebhookResult =
  | { status: 200; body: { ok: true; applied: boolean } }
  | { status: 200; body: { ok: true; ignored: string } }
  | { status: 400 | 401; body: { error: string } };

// Memproses notifikasi Midtrans. Aman diulang (Midtrans mengirim ulang): perpanjangan paket hanya
// terjadi pada transisi pertama ke "paid", dalam satu pernyataan SQL bersama pembaruan toko.
export async function handleNotification(n: Partial<Notification>): Promise<WebhookResult> {
  if (!verifySignature(n)) return { status: 401, body: { error: 'Invalid signature' } };
  const notification = n as Notification;

  const teamId = teamIdOfOrder(notification.order_id);
  if (teamId === null) return { status: 200, body: { ok: true, ignored: 'unknown_order' } };

  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(subPayments)
      .where(and(eq(subPayments.orderId, notification.order_id), eq(subPayments.teamId, teamId)))
      .limit(1),
  ]);
  const payment = rows[0];
  if (!payment) return { status: 200, body: { ok: true, ignored: 'unknown_order' } };

  // Jumlah yang dibayar harus sama dengan tagihan yang kita buat.
  if (Number(notification.gross_amount) !== payment.amount) {
    return { status: 400, body: { error: 'Amount mismatch' } };
  }

  const outcome = outcomeOf(notification);
  if (outcome === 'ignored') return { status: 200, body: { ok: true, ignored: 'status' } };

  if (outcome === 'paid') {
    const [res] = await withTenant(teamId, [
      db.execute(sql`
        with p as (
          update sub_payments
             set status = 'paid', paid_at = now(), payment_type = ${notification.payment_type ?? null}, updated_at = now()
           where id = ${payment.id} and team_id = ${teamId} and status <> 'paid'
          returning period
        )
        update teams
           set plan_name = ${payment.plan},
               subscription_status = 'active',
               plan_expires_at = greatest(coalesce(plan_expires_at, now()), now())
                 + (case when p.period = 'year' then interval '1 year' else interval '1 month' end),
               updated_at = now()
          from p
         where teams.id = ${teamId}
        returning teams.id
      `),
    ]);
    const applied = (res as unknown as { rows: unknown[] }).rows.length > 0;
    if (applied) {
      await withTenant(teamId, [
        auditEntry(teamId, payment.createdBy, 'SUBSCRIPTION_PAID', {
          entityType: 'sub_payment',
          entityId: payment.id,
          metadata: { plan: payment.plan, period: payment.period, amount: payment.amount },
        }),
      ]);
    }
    return { status: 200, body: { ok: true, applied } };
  }

  // pending/failed/expired: hanya dari "pending"; pembayaran yang sudah lunas tidak diturunkan.
  const target: SubPaymentStatus = outcome;
  await withTenant(teamId, [
    db
      .update(subPayments)
      .set({ status: target, updatedAt: new Date() })
      .where(and(eq(subPayments.id, payment.id), eq(subPayments.teamId, teamId), eq(subPayments.status, 'pending'))),
  ]);
  return { status: 200, body: { ok: true, applied: false } };
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export type Subscription = { plan: 'free' | PlanKey; active: boolean; expiresAt: Date | null };

export async function getSubscription(teamId: number, now = new Date()): Promise<Subscription> {
  const [row] = await db
    .select({ planName: teams.planName, expiresAt: teams.planExpiresAt })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const active = Boolean(row?.expiresAt && row.expiresAt > now);
  return { plan: active && row?.planName && row.planName in PLANS ? (row.planName as PlanKey) : 'free', active, expiresAt: row?.expiresAt ?? null };
}

export async function listSubscriptionPayments(teamId: number, limit = 10) {
  const [rows] = await withTenant(teamId, [
    db.select().from(subPayments).where(eq(subPayments.teamId, teamId)).orderBy(desc(subPayments.id)).limit(limit),
  ]);
  return rows;
}
