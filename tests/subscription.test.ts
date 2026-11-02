import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { POST } from '@/app/api/midtrans/webhook/route';
import {
  SubscriptionError,
  getSubscription,
  handleNotification,
  listSubscriptionPayments,
  makeOrderId,
  startCheckout,
  type Actor,
} from '@/lib/payments/subscription';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const KEY = 'SB-Mid-server-test';
const tag = `sub-test-${Date.now()}`;
let u1 = 0;
let A: Actor;
let B: Actor;

const sign = (orderId: string, code: string, gross: string) =>
  createHash('sha512').update(`${orderId}${code}${gross}${KEY}`).digest('hex');
const note = (orderId: string, status: string, o: Record<string, string> = {}) => {
  const gross = o.gross_amount ?? '99000.00';
  return { order_id: orderId, status_code: '200', gross_amount: gross, signature_key: sign(orderId, '200', gross), transaction_status: status, payment_type: 'qris', ...o };
};
// Driver Neon juga memakai fetch, jadi hanya panggilan ke Midtrans yang dipalsukan.
const realFetch = globalThis.fetch;
const mockMidtrans = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    String(input).includes('midtrans.com') ? Promise.resolve(new Response(JSON.stringify(body), { status })) : realFetch(input, init)
  );
const mockSnap = () => mockMidtrans(201, { token: 'tok', redirect_url: 'https://pay.test/tok' });
const paymentOf = async (teamId: number, orderId: string) =>
  (await owner`select status, paid_at, payment_type from sub_payments where team_id = ${teamId} and order_id = ${orderId}`)[0];
const expiresOf = async (teamId: number) => (await owner`select plan_name, subscription_status, plan_expires_at from teams where id = ${teamId}`)[0];
// Memulai checkout dan mengembalikan order_id yang dibuat.
const checkout = async (actor: Actor, period: 'month' | 'year' = 'month') => {
  mockSnap();
  await startCheckout(actor, 'pro', period);
  const [row] = await owner`select order_id from sub_payments where team_id = ${actor.teamId} order by id desc limit 1`;
  return row.order_id as string;
};

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  const a = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const b = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  A = { teamId: a, userId: u1, email: tag + '@test.local' };
  B = { teamId: b, userId: u1, email: tag + '@test.local' };
});

beforeEach(() => {
  vi.stubEnv('MIDTRANS_SERVER_KEY', KEY);
  vi.stubEnv('BASE_URL', 'https://lapakin.test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  for (const t of ['activity_logs', 'sub_payments']) await owner.query(`delete from ${t} where team_id in (${ids[0]}, ${ids[1]})`);
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${u1}`;
});

describe('checkout', () => {
  it('membuat pembayaran pending dengan harga dari konfigurasi dan mengembalikan URL Midtrans', async () => {
    mockSnap();
    const url = await startCheckout(A, 'pro', 'year');
    expect(url).toBe('https://pay.test/tok');
    const [p] = await listSubscriptionPayments(A.teamId);
    expect(p).toMatchObject({ plan: 'pro', period: 'year', amount: 990000, status: 'pending', snapToken: 'tok', redirectUrl: 'https://pay.test/tok' });
    expect(p.orderId).toMatch(new RegExp(`^LPK-${A.teamId}-`));
    expect((await listSubscriptionPayments(B.teamId)).some((x) => x.id === p.id)).toBe(false);
  });

  it('menandai pembayaran gagal dan melempar galat bila Midtrans menolak', async () => {
    mockMidtrans(401, { error_messages: ['Access denied'] });
    await expect(startCheckout(A, 'pro', 'month')).rejects.toBeInstanceOf(SubscriptionError);
    const [p] = await listSubscriptionPayments(A.teamId);
    expect(p.status).toBe('failed');
  });

  it('menolak paket atau periode yang tidak dikenal', async () => {
    await expect(startCheckout(A, 'enterprise' as never, 'month')).rejects.toBeInstanceOf(SubscriptionError);
    await expect(startCheckout(A, 'pro', 'week' as never)).rejects.toBeInstanceOf(SubscriptionError);
  });
});

describe('webhook', () => {
  it('menolak tanda tangan salah dan tidak mengubah apa pun', async () => {
    const orderId = await checkout(A);
    const bad = { ...note(orderId, 'settlement'), signature_key: 'x'.repeat(128) };
    expect((await handleNotification(bad)).status).toBe(401);
    expect((await paymentOf(A.teamId, orderId)).status).toBe('pending');
  });

  it('settlement melunasi dan memperpanjang paket satu bulan; kiriman ulang tidak memperpanjang lagi', async () => {
    const orderId = await checkout(B);
    const first = await handleNotification(note(orderId, 'settlement'));
    expect(first).toEqual({ status: 200, body: { ok: true, applied: true } });
    expect((await paymentOf(B.teamId, orderId))).toMatchObject({ status: 'paid', payment_type: 'qris' });
    const t1 = await expiresOf(B.teamId);
    expect(t1).toMatchObject({ plan_name: 'pro', subscription_status: 'active' });
    const days = (new Date(t1.plan_expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);

    const again = await handleNotification(note(orderId, 'settlement'));
    expect(again).toEqual({ status: 200, body: { ok: true, applied: false } });
    expect((await expiresOf(B.teamId)).plan_expires_at).toEqual(t1.plan_expires_at);

    const sub = await getSubscription(B.teamId);
    expect(sub).toMatchObject({ plan: 'pro', active: true });
  });

  it('pembayaran berikutnya menyambung dari tanggal berakhir, bukan dari hari ini', async () => {
    const before = new Date((await expiresOf(B.teamId)).plan_expires_at).getTime();
    const orderId = await checkout(B, 'year');
    await handleNotification(note(orderId, 'settlement', { gross_amount: '990000.00' }));
    const after = new Date((await expiresOf(B.teamId)).plan_expires_at).getTime();
    expect((after - before) / 86_400_000).toBeGreaterThan(360);
    expect((after - before) / 86_400_000).toBeLessThan(370);
  });

  it('menolak jumlah yang berbeda dari tagihan', async () => {
    const orderId = await checkout(A);
    const res = await handleNotification(note(orderId, 'settlement', { gross_amount: '1000.00' }));
    expect(res).toEqual({ status: 400, body: { error: 'Amount mismatch' } });
    expect((await paymentOf(A.teamId, orderId)).status).toBe('pending');
  });

  it('expire dan deny menandai gagal, tetapi pembayaran yang sudah lunas tidak diturunkan', async () => {
    const o1 = await checkout(A);
    await handleNotification(note(o1, 'expire'));
    expect((await paymentOf(A.teamId, o1)).status).toBe('expired');

    const o2 = await checkout(A);
    await handleNotification(note(o2, 'settlement'));
    await handleNotification(note(o2, 'expire'));
    await handleNotification(note(o2, 'deny'));
    expect((await paymentOf(A.teamId, o2)).status).toBe('paid');
  });

  it('capture dengan fraud challenge tidak melunasi; refund diabaikan', async () => {
    const orderId = await checkout(A);
    await handleNotification(note(orderId, 'capture', { fraud_status: 'challenge' }));
    expect((await paymentOf(A.teamId, orderId)).status).toBe('pending');
    expect((await handleNotification(note(orderId, 'refund'))).body).toEqual({ ok: true, ignored: 'status' });
  });

  it('order tak dikenal atau toko lain: dijawab 200 dan diabaikan', async () => {
    const stranger = makeOrderId(999_999_999);
    expect(await handleNotification(note(stranger, 'settlement'))).toEqual({ status: 200, body: { ok: true, ignored: 'unknown_order' } });
    expect((await handleNotification(note('ORDER-LAIN', 'settlement'))).body).toEqual({ ok: true, ignored: 'unknown_order' });
  });

  it('dua notifikasi settlement bersamaan hanya memperpanjang sekali', async () => {
    const orderId = await checkout(A);
    const before = (await expiresOf(A.teamId)).plan_expires_at as string | null;
    const results = await Promise.all([handleNotification(note(orderId, 'settlement')), handleNotification(note(orderId, 'settlement'))]);
    const applied = results.filter((r) => 'applied' in r.body && r.body.applied).length;
    expect(applied).toBe(1);
    const after = new Date((await expiresOf(A.teamId)).plan_expires_at).getTime();
    const base = before ? Math.max(new Date(before).getTime(), Date.now()) : Date.now();
    expect((after - base) / 86_400_000).toBeLessThan(32);
  });
});

describe('route webhook', () => {
  const post = (body: unknown, raw?: string) =>
    POST(new Request('http://localhost/api/midtrans/webhook', { method: 'POST', body: raw ?? JSON.stringify(body) }));

  it('JSON rusak 400, tanda tangan salah 401, notifikasi sah 200', async () => {
    expect((await post(null, 'bukan json')).status).toBe(400);
    expect((await post({ order_id: 'x', signature_key: 'salah' })).status).toBe(401);
    const orderId = await checkout(A);
    const res = await post(note(orderId, 'pending'));
    expect(res.status).toBe(200);
  });
});
