import { createHash, timingSafeEqual } from 'node:crypto';

// Klien Midtrans berbasis fetch (kompatibel Workers) dan fungsi murni untuk webhook. Server key hanya
// dari lingkungan (wrangler secret put MIDTRANS_SERVER_KEY); tidak ada data kartu yang lewat server ini.

export class MidtransError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MidtransError';
  }
}

const serverKey = () => {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new MidtransError('Midtrans is not configured');
  return key;
};

const snapUrl = () =>
  process.env.MIDTRANS_IS_PRODUCTION === 'true'
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

export type SnapInput = {
  orderId: string;
  amount: number;
  itemName: string;
  email: string;
  finishUrl: string;
};

export type SnapResult = { token: string; redirectUrl: string };

// Membuat transaksi Snap; pembeli membayar di halaman Midtrans (QRIS, VA, e-wallet, kartu).
export async function createSnapTransaction(input: SnapInput): Promise<SnapResult> {
  const res = await fetch(snapUrl(), {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Basic ${btoa(`${serverKey()}:`)}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.amount },
      item_details: [{ id: input.orderId, price: input.amount, quantity: 1, name: input.itemName.slice(0, 50) }],
      customer_details: { email: input.email },
      callbacks: { finish: input.finishUrl },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; redirect_url?: string; error_messages?: string[] };
  if (!res.ok || !body.token || !body.redirect_url) {
    throw new MidtransError(body.error_messages?.join('; ') || `Midtrans responded ${res.status}`);
  }
  return { token: body.token, redirectUrl: body.redirect_url };
}

export type Notification = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
};

// SHA512(order_id + status_code + gross_amount + server key), dibandingkan dalam waktu konstan.
export function verifySignature(n: Partial<Notification>, key = serverKey()): boolean {
  if (!n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) return false;
  const expected = createHash('sha512').update(`${n.order_id}${n.status_code}${n.gross_amount}${key}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(n.signature_key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PaymentOutcome = 'paid' | 'pending' | 'failed' | 'expired' | 'ignored';

// Memetakan status transaksi Midtrans. `capture` (kartu) hanya dihitung lunas bila lolos penyaring
// penipuan; refund dan chargeback diabaikan di sini (ditangani manual).
export function outcomeOf(n: Pick<Notification, 'transaction_status' | 'fraud_status'>): PaymentOutcome {
  switch (n.transaction_status) {
    case 'settlement':
      return 'paid';
    case 'capture':
      return !n.fraud_status || n.fraud_status === 'accept' ? 'paid' : 'pending';
    case 'pending':
      return 'pending';
    case 'deny':
    case 'cancel':
    case 'failure':
      return 'failed';
    case 'expire':
      return 'expired';
    default:
      return 'ignored';
  }
}
