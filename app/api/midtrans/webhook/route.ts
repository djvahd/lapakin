import { handleNotification } from '@/lib/payments/subscription';

// Notifikasi pembayaran dari Midtrans (HTTP notification URL). Keaslian dijamin tanda tangan
// SHA512 dengan server key; permintaan tanpa tanda tangan sah ditolak 401.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid body' }, { status: 400 });

  try {
    const result = await handleNotification(body as Record<string, string>);
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    // Midtrans mengirim ulang bila bukan 200; kegagalan sementara (mis. database) layak diulang.
    console.error('Midtrans webhook failed:', e);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
