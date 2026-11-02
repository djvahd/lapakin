import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { MidtransError, createSnapTransaction, outcomeOf, verifySignature } from '@/lib/payments/midtrans';
import { planPrice } from '@/lib/payments/plans';
import { makeOrderId, teamIdOfOrder } from '@/lib/payments/subscription';

const KEY = 'SB-Mid-server-test';
const sign = (orderId: string, code: string, gross: string) =>
  createHash('sha512').update(`${orderId}${code}${gross}${KEY}`).digest('hex');

describe('verifySignature', () => {
  const base = { order_id: 'LPK-1-abc', status_code: '200', gross_amount: '99000.00' };

  it('menerima tanda tangan yang benar dan menolak yang lain', () => {
    expect(verifySignature({ ...base, signature_key: sign('LPK-1-abc', '200', '99000.00') }, KEY)).toBe(true);
    expect(verifySignature({ ...base, signature_key: 'x'.repeat(128) }, KEY)).toBe(false);
    expect(verifySignature({ ...base, gross_amount: '1.00', signature_key: sign('LPK-1-abc', '200', '99000.00') }, KEY)).toBe(false);
    expect(verifySignature({ ...base, signature_key: sign('LPK-1-abc', '200', '99000.00') }, 'kunci-lain')).toBe(false);
    expect(verifySignature({ ...base }, KEY)).toBe(false);
    expect(verifySignature({}, KEY)).toBe(false);
  });
});

describe('outcomeOf', () => {
  it('memetakan status transaksi; capture kartu hanya lunas bila lolos fraud', () => {
    expect(outcomeOf({ transaction_status: 'settlement' })).toBe('paid');
    expect(outcomeOf({ transaction_status: 'capture', fraud_status: 'accept' })).toBe('paid');
    expect(outcomeOf({ transaction_status: 'capture' })).toBe('paid');
    expect(outcomeOf({ transaction_status: 'capture', fraud_status: 'challenge' })).toBe('pending');
    expect(outcomeOf({ transaction_status: 'pending' })).toBe('pending');
    for (const s of ['deny', 'cancel', 'failure']) expect(outcomeOf({ transaction_status: s })).toBe('failed');
    expect(outcomeOf({ transaction_status: 'expire' })).toBe('expired');
    for (const s of ['refund', 'chargeback', 'partial_refund', 'zzz']) expect(outcomeOf({ transaction_status: s })).toBe('ignored');
  });
});

describe('order id dan harga', () => {
  it('order id memuat id toko dan bisa dibaca kembali; yang asing ditolak', () => {
    const id = makeOrderId(42);
    expect(id.length).toBeLessThanOrEqual(50);
    expect(teamIdOfOrder(id)).toBe(42);
    expect(teamIdOfOrder('ORDER-1')).toBeNull();
    expect(teamIdOfOrder('LPK-x-abc')).toBeNull();
    expect(makeOrderId(1)).not.toBe(makeOrderId(1));
  });

  it('tahunan = 10 kali bulanan', () => {
    expect(planPrice('pro', 'year')).toBe(planPrice('pro', 'month') * 10);
  });
});

describe('createSnapTransaction', () => {
  const input = { orderId: 'LPK-1-abc', amount: 99000, itemName: 'Lapakin Pro (1 bulan)', email: 'a@b.test', finishUrl: 'https://x.test/dashboard' };

  beforeEach(() => {
    vi.stubEnv('MIDTRANS_SERVER_KEY', KEY);
    vi.stubEnv('MIDTRANS_IS_PRODUCTION', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('memanggil sandbox dengan Basic auth server key dan mengembalikan token dan URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'tok', redirect_url: 'https://pay.test/tok' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createSnapTransaction(input)).toEqual({ token: 'tok', redirectUrl: 'https://pay.test/tok' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');
    expect(init.headers.authorization).toBe(`Basic ${btoa(`${KEY}:`)}`);
    const body = JSON.parse(init.body);
    expect(body.transaction_details).toEqual({ order_id: 'LPK-1-abc', gross_amount: 99000 });
    expect(body.callbacks.finish).toBe('https://x.test/dashboard');
  });

  it('memakai host produksi bila MIDTRANS_IS_PRODUCTION=true', async () => {
    vi.stubEnv('MIDTRANS_IS_PRODUCTION', 'true');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 't', redirect_url: 'u' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await createSnapTransaction(input);
    expect(fetchMock.mock.calls[0][0]).toBe('https://app.midtrans.com/snap/v1/transactions');
  });

  it('melempar MidtransError bila Midtrans menolak atau key belum diisi', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error_messages: ['Access denied'] }), { status: 401 })));
    await expect(createSnapTransaction(input)).rejects.toThrow('Access denied');

    vi.stubEnv('MIDTRANS_SERVER_KEY', '');
    await expect(createSnapTransaction(input)).rejects.toBeInstanceOf(MidtransError);
  });
});
