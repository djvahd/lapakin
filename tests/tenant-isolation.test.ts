import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { audit } from '@/lib/audit';
import { activityLogs } from '@/lib/db/schema';

// Tes integrasi terhadap database sungguhan (branch dev Neon).
// POSTGRES_URL harus memakai role lapakin_app dan MIGRATION_URL role pemilik (lihat docs/tenancy.md).
// Bila role aplikasi bypass RLS, tes ini sengaja GAGAL agar salah konfigurasi tidak lolos diam-diam.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `rls-test-${Date.now()}`;
let teamA = 0;
let teamB = 0;

beforeAll(async () => {
  const a = await owner`insert into teams (name) values (${tag + '-a'}) returning id`;
  const b = await owner`insert into teams (name) values (${tag + '-b'}) returning id`;
  teamA = a[0].id;
  teamB = b[0].id;
  await owner`insert into activity_logs (team_id, action) values (${teamA}, 'A_ONLY'), (${teamB}, 'B_ONLY')`;
});

afterAll(async () => {
  await owner`delete from activity_logs where team_id in (${teamA}, ${teamB})`;
  await owner`delete from teams where id in (${teamA}, ${teamB})`;
});

const actionsOf = (rows: { action: string }[]) => rows.map((r) => r.action).sort();

describe('isolasi tenant (RLS)', () => {
  it('aplikasi tersambung sebagai role tanpa BYPASSRLS', async () => {
    const r = await db.execute(
      sql`select current_user as u, (select rolbypassrls from pg_roles where rolname = current_user) as bypass`
    );
    expect(r.rows[0]).toEqual({ u: 'lapakin_app', bypass: false });
  });

  it('tanpa konteks tenant tidak ada baris yang terbaca', async () => {
    const rows = await db.select().from(activityLogs);
    expect(rows).toEqual([]);
  });

  it('toko A hanya membaca data toko A', async () => {
    const [rows] = await withTenant(teamA, [db.select().from(activityLogs)]);
    expect(actionsOf(rows)).toEqual(['A_ONLY']);
  });

  it('toko B hanya membaca data toko B', async () => {
    const [rows] = await withTenant(teamB, [db.select().from(activityLogs)]);
    expect(actionsOf(rows)).toEqual(['B_ONLY']);
  });

  it('filter team_id toko lain tetap tidak mengembalikan data (kondisi sengaja salah)', async () => {
    const [rows] = await withTenant(teamA, [
      db.select().from(activityLogs).where(eq(activityLogs.teamId, teamB))
    ]);
    expect(rows).toEqual([]);
  });

  it('menulis baris untuk toko lain ditolak', async () => {
    await expect(
      withTenant(teamA, [
        db.insert(activityLogs).values({ teamId: teamB, action: 'EVIL' })
      ])
    ).rejects.toThrow(/row-level security/i);
  });

  it('mengubah dan menghapus baris toko lain tidak berdampak', async () => {
    await withTenant(teamA, [
      db.update(activityLogs).set({ action: 'HACKED' }).where(eq(activityLogs.teamId, teamB)),
      db.delete(activityLogs).where(eq(activityLogs.teamId, teamB))
    ]);
    const rows = await owner`select action from activity_logs where team_id = ${teamB}`;
    expect(rows.map((r) => r.action)).toEqual(['B_ONLY']);
  });

  it('konteks tidak bocor ke permintaan berikutnya', async () => {
    await withTenant(teamA, [db.select().from(activityLogs)]);
    const rows = await db.select().from(activityLogs);
    expect(rows).toEqual([]);
  });

  it('audit() menulis ke toko yang benar dengan entitas dan metadata', async () => {
    await audit(teamA, null, 'ORDER_CREATED', {
      entityType: 'order',
      entityId: 7,
      metadata: { total: 1000 }
    });
    const [rows] = await withTenant(teamA, [
      db.select().from(activityLogs).where(eq(activityLogs.action, 'ORDER_CREATED'))
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ teamId: teamA, entityType: 'order', entityId: 7, metadata: { total: 1000 } });
    const [others] = await withTenant(teamB, [
      db.select().from(activityLogs).where(eq(activityLogs.action, 'ORDER_CREATED'))
    ]);
    expect(others).toEqual([]);
  });

  it('teamId tidak valid ditolak sebelum menyentuh database', async () => {
    await expect(withTenant(0, [db.select().from(activityLogs)])).rejects.toThrow('teamId tidak valid');
    await expect(withTenant(1.5, [db.select().from(activityLogs)])).rejects.toThrow('teamId tidak valid');
  });
});
