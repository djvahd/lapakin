import { sql } from 'drizzle-orm';
import type { BatchItem, BatchResponse } from 'drizzle-orm/batch';
import { db } from './drizzle';

type Queries = [BatchItem<'pg'>, ...BatchItem<'pg'>[]];

// Menjalankan query tabel tenant dalam satu transaksi dengan konteks toko.
// Driver HTTP tidak punya sesi, jadi set_config (lokal ke transaksi) dikirim satu batch
// dengan query-nya. Konteks hilang saat transaksi selesai dan tidak bocor ke permintaan lain.
// RLS hanya berlaku bila aplikasi tersambung sebagai lapakin_app (lihat migrasi 0002).
export async function withTenant<Q extends Queries>(
  teamId: number,
  queries: Q
): Promise<BatchResponse<Q>> {
  if (!Number.isInteger(teamId) || teamId <= 0) {
    throw new Error('withTenant: teamId tidak valid');
  }
  const setContext = db.execute(
    sql`select set_config('app.team_id', ${String(teamId)}, true)`
  );
  const results = await db.batch([setContext, ...queries] as any);
  return results.slice(1) as unknown as BatchResponse<Q>;
}
