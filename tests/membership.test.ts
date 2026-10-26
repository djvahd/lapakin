import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { resolveMembership } from '@/lib/auth/tenant';

// Tes integrasi: keanggotaan pengguna di toko (butuh MIGRATION_URL dan POSTGRES_URL di .env).
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `membership-test-${Date.now()}`;
let userMulti = 0; // anggota toko A (owner) dan B (member)
let userOnlyA = 0; // anggota toko A saja (member)
let teamA = 0;
let teamB = 0;

beforeAll(async () => {
  const u1 = await owner`insert into users (email, password_hash) values (${tag + '-1@test.local'}, 'x') returning id`;
  const u2 = await owner`insert into users (email, password_hash) values (${tag + '-2@test.local'}, 'x') returning id`;
  const a = await owner`insert into teams (name) values (${tag + '-a'}) returning id`;
  const b = await owner`insert into teams (name) values (${tag + '-b'}) returning id`;
  userMulti = u1[0].id;
  userOnlyA = u2[0].id;
  teamA = a[0].id;
  teamB = b[0].id;
  await owner`insert into team_members (user_id, team_id, role, joined_at) values (${userMulti}, ${teamA}, 'owner', now() - interval '1 day')`;
  await owner`insert into team_members (user_id, team_id, role) values (${userMulti}, ${teamB}, 'member')`;
  await owner`insert into team_members (user_id, team_id, role) values (${userOnlyA}, ${teamA}, 'member')`;
});

afterAll(async () => {
  await owner`delete from team_members where team_id in (${teamA}, ${teamB})`;
  await owner`delete from teams where id in (${teamA}, ${teamB})`;
  await owner`delete from users where id in (${userMulti}, ${userOnlyA})`;
});

describe('resolveMembership', () => {
  it('memakai toko dari sesi dan role di toko itu', async () => {
    expect(await resolveMembership(userMulti, teamA)).toEqual({ teamId: teamA, role: 'owner' });
    expect(await resolveMembership(userMulti, teamB)).toEqual({ teamId: teamB, role: 'member' });
  });

  it('role berbeda per toko: pengguna yang sama owner di A, member di B', async () => {
    const a = await resolveMembership(userMulti, teamA);
    const b = await resolveMembership(userMulti, teamB);
    expect(a?.role).not.toBe(b?.role);
  });

  it('toko di sesi yang bukan keanggotaannya ditolak, tanpa jatuh ke toko lain', async () => {
    expect(await resolveMembership(userOnlyA, teamB)).toBeNull();
  });

  it('sesi lama tanpa teamId memakai keanggotaan paling awal', async () => {
    expect(await resolveMembership(userMulti, undefined)).toEqual({ teamId: teamA, role: 'owner' });
    expect(await resolveMembership(userMulti, null)).toEqual({ teamId: teamA, role: 'owner' });
  });

  it('pengguna tanpa keanggotaan menghasilkan null', async () => {
    expect(await resolveMembership(999999999, undefined)).toBeNull();
  });
});
