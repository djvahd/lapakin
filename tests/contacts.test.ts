import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { contacts } from '@/modules/contacts/schema';
import { contactInputSchema, listQuerySchema, type ContactInput } from '@/modules/contacts/schemas';
import {
  ContactError,
  archiveContact,
  createContact,
  createTag,
  getContact,
  listContacts,
  listTags,
  restoreContact,
  updateContact,
  type Actor,
} from '@/modules/contacts/service';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `contacts-test-${Date.now()}`;
let userId = 0;
let A: Actor;
let B: Actor;

const input = (o: Record<string, unknown>): ContactInput =>
  contactInputSchema.parse({ kind: 'person', name: 'Tanpa Nama', ...o });
const query = (o: Record<string, unknown> = {}) => listQuerySchema.parse(o);
const names = (r: { items: { name: string }[] }) => r.items.map((i) => i.name);
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(ContactError);
  expect((e as ContactError).code).toBe(code);
};

beforeAll(async () => {
  const u = await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`;
  userId = u[0].id;
  const a = await owner`insert into teams (name) values (${tag + '-a'}) returning id`;
  const b = await owner`insert into teams (name) values (${tag + '-b'}) returning id`;
  A = { teamId: a[0].id, userId };
  B = { teamId: b[0].id, userId };
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contact_tag_links where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contacts where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contact_tags where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${userId}`;
});

describe('kontak: membuat dan membaca', () => {
  it('membuat perusahaan dan orang yang terhubung ke perusahaan', async () => {
    const company = await createContact(A, input({ kind: 'company', name: 'PT Maju Jaya', isCustomer: true }));
    const person = await createContact(
      A,
      input({ name: 'Budi Santoso', companyId: company.id, email: 'budi@maju.test', phone: '0812' })
    );
    expect(person.companyId).toBe(company.id);

    const detail = await getContact(A.teamId, person.id);
    expect(detail?.companyName).toBe('PT Maju Jaya');

    const companyDetail = await getContact(A.teamId, company.id);
    expect(companyDetail?.people.map((p) => p.name)).toEqual(['Budi Santoso']);
  });

  it('tabel kontak tanpa konteks tenant kosong (RLS)', async () => {
    expect(await db.select().from(contacts)).toEqual([]);
  });
});

describe('kontak: isolasi antar toko', () => {
  let aCompany = 0;
  let aTag = 0;

  beforeAll(async () => {
    aCompany = (await createContact(A, input({ kind: 'company', name: 'Rahasia Toko A' }))).id;
    aTag = (await createTag(A, { name: 'rahasia-a', color: null })).id;
  });

  it('toko B tidak melihat kontak toko A di daftar maupun detail', async () => {
    const list = await listContacts(B.teamId, query());
    expect(list.total).toBe(0);
    expect(await getContact(B.teamId, aCompany)).toBeNull();
  });

  it('toko B tidak bisa mengubah atau mengarsipkan kontak toko A', async () => {
    await expectCode(updateContact(B, aCompany, input({ kind: 'company', name: 'Dibajak' })), 'not_found');
    await expectCode(archiveContact(B, aCompany), 'not_found');
    expect((await getContact(A.teamId, aCompany))?.name).toBe('Rahasia Toko A');
  });

  it('layanan menolak perusahaan dan tag milik toko lain', async () => {
    await expectCode(createContact(B, input({ name: 'X', companyId: aCompany })), 'invalid_company');
    await expectCode(createContact(B, input({ name: 'X', tagIds: [aTag] })), 'invalid_tag');
  });

  it('database menolak referensi lintas toko walau layanan dilewati (kunci asing komposit)', async () => {
    // Sebagai pemilik (tanpa RLS): perusahaan toko A tidak boleh dirujuk dari toko B.
    await expect(
      owner`insert into contacts (team_id, kind, name, company_id) values (${B.teamId}, 'person', 'Penyusup', ${aCompany})`
    ).rejects.toThrow(/foreign key/i);

    const own = await createContact(B, input({ name: 'Milik B' }));
    await expect(
      owner`insert into contact_tag_links (contact_id, tag_id, team_id) values (${own.id}, ${aTag}, ${B.teamId})`
    ).rejects.toThrow(/foreign key/i);
  });
});

describe('kontak: pencarian, filter, paginasi', () => {
  const tagIds: Record<string, number> = {};

  beforeAll(async () => {
    tagIds.vip = (await createTag(A, { name: 'VIP', color: '#ff0000' })).id;
    await createContact(A, input({ name: 'Alpha Store', kind: 'company', isSupplier: true, tagIds: [tagIds.vip] }));
    await createContact(A, input({ name: 'Bravo', email: 'bravo@search.test', isCustomer: true }));
    await createContact(A, input({ name: '100% Murni', phone: '555-0100' }));
    await createContact(A, input({ name: 'Under_score' }));
  });

  it('mencari berdasarkan nama, email, dan telepon tanpa membedakan huruf besar', async () => {
    expect(names(await listContacts(A.teamId, query({ q: 'ALPHA' })))).toEqual(['Alpha Store']);
    expect(names(await listContacts(A.teamId, query({ q: 'search.test' })))).toEqual(['Bravo']);
    expect(names(await listContacts(A.teamId, query({ q: '555-01' })))).toEqual(['100% Murni']);
  });

  it('karakter wildcard dalam kata kunci diperlakukan sebagai teks biasa', async () => {
    expect(names(await listContacts(A.teamId, query({ q: '%' })))).toEqual(['100% Murni']);
    expect(names(await listContacts(A.teamId, query({ q: '_' })))).toEqual(['Under_score']);
  });

  it('menyaring berdasarkan jenis, peran, dan tag', async () => {
    const companies = await listContacts(A.teamId, query({ kind: 'company' }));
    expect(names(companies)).toEqual(expect.arrayContaining(['Alpha Store']));
    expect(companies.items.every((i) => i.kind === 'company')).toBe(true);

    expect(names(await listContacts(A.teamId, query({ role: 'supplier' })))).toEqual(['Alpha Store']);
    expect(names(await listContacts(A.teamId, query({ role: 'customer' })))).toEqual(
      expect.arrayContaining(['Bravo'])
    );

    const byTag = await listContacts(A.teamId, query({ tagId: tagIds.vip }));
    expect(names(byTag)).toEqual(['Alpha Store']);
    expect(byTag.items[0].tags).toEqual([{ id: tagIds.vip, name: 'VIP', color: '#ff0000' }]);
  });

  it('paginasi mengembalikan total dan halaman yang benar, terurut menurut nama', async () => {
    const all = await listContacts(A.teamId, query({ pageSize: 100 }));
    expect(all.total).toBe(all.items.length);

    const p1 = await listContacts(A.teamId, query({ pageSize: 2, page: 1 }));
    const p2 = await listContacts(A.teamId, query({ pageSize: 2, page: 2 }));
    expect(p1.items).toHaveLength(2);
    expect(p1.total).toBe(all.total);
    expect(p1.pageCount).toBe(Math.ceil(all.total / 2));
    expect(names(p1).concat(names(p2))).toEqual(names(all).slice(0, names(p1).length + names(p2).length));
  });
});

describe('kontak: ubah, tag, dan arsip', () => {
  it('mengubah kontak dan mengganti tag secara atomik, lalu mencatat audit', async () => {
    const t1 = await createTag(A, { name: 'tag-satu', color: null });
    const t2 = await createTag(A, { name: 'tag-dua', color: null });
    const c = await createContact(A, input({ name: 'Ubah Saya', tagIds: [t1.id] }));

    const updated = await updateContact(A, c.id, input({ name: 'Sudah Diubah', tagIds: [t2.id], isCustomer: true }));
    expect(updated.name).toBe('Sudah Diubah');

    const detail = await getContact(A.teamId, c.id);
    expect(detail?.tags.map((t) => t.name)).toEqual(['tag-dua']);
    expect(detail?.isCustomer).toBe(true);

    const [logs] = await withTenant(A.teamId, [
      db
        .select({ action: activityLogs.action, entityId: activityLogs.entityId, entityType: activityLogs.entityType })
        .from(activityLogs)
        .where(and(eq(activityLogs.teamId, A.teamId), eq(activityLogs.entityId, c.id))),
    ]);
    expect(logs.map((l) => l.action).sort()).toEqual(['CONTACT_CREATED', 'CONTACT_UPDATED']);
    expect(logs.every((l) => l.entityType === 'contact')).toBe(true);
  });

  it('menolak perusahaan yang tidak valid, diri sendiri, dan mengubah perusahaan yang masih punya orang', async () => {
    const company = await createContact(A, input({ kind: 'company', name: 'PT Induk' }));
    const person = await createContact(A, input({ name: 'Orang Induk', companyId: company.id }));

    await expectCode(updateContact(A, person.id, input({ name: 'Orang', companyId: person.id })), 'invalid_company');
    await expectCode(createContact(A, input({ name: 'Y', companyId: person.id })), 'invalid_company');
    await expectCode(
      updateContact(A, company.id, input({ kind: 'person', name: 'PT Induk' })),
      'company_has_people'
    );
  });

  it('mengarsipkan menyembunyikan dari daftar bawaan, bisa dipulihkan, dan idempoten', async () => {
    const c = await createContact(A, input({ name: 'Arsipkan Aku' }));
    await archiveContact(A, c.id);
    await archiveContact(A, c.id);

    expect(names(await listContacts(A.teamId, query({ q: 'Arsipkan' })))).toEqual([]);
    expect(names(await listContacts(A.teamId, query({ q: 'Arsipkan', archived: true })))).toEqual(['Arsipkan Aku']);
    await expectCode(updateContact(A, c.id, input({ name: 'Edit Saat Arsip' })), 'archived');

    await restoreContact(A, c.id);
    expect(names(await listContacts(A.teamId, query({ q: 'Arsipkan' })))).toEqual(['Arsipkan Aku']);

    const [logs] = await withTenant(A.teamId, [
      db
        .select({ action: activityLogs.action })
        .from(activityLogs)
        .where(and(eq(activityLogs.teamId, A.teamId), eq(activityLogs.entityId, c.id))),
    ]);
    // Arsip kedua adalah no-op: hanya satu entri CONTACT_ARCHIVED.
    expect(logs.map((l) => l.action).sort()).toEqual(['CONTACT_ARCHIVED', 'CONTACT_CREATED', 'CONTACT_RESTORED']);
  });

  it('kontak tidak ditemukan menghasilkan ContactError not_found', async () => {
    await expectCode(archiveContact(A, 999999999), 'not_found');
    expect(await getContact(A.teamId, 999999999)).toBeNull();
  });
});

describe('tag', () => {
  it('nama tag unik per toko tanpa membedakan huruf besar, tetapi boleh sama di toko lain', async () => {
    await createTag(A, { name: 'Prioritas', color: null });
    await expectCode(createTag(A, { name: 'PRIORITAS', color: null }), 'tag_exists');
    await expect(createTag(B, { name: 'Prioritas', color: null })).resolves.toMatchObject({ name: 'Prioritas' });
  });

  it('listTags menghitung kontak per tag dan hanya menampilkan tag toko sendiri', async () => {
    const t = await createTag(A, { name: 'hitung-aku', color: null });
    await createContact(A, input({ name: 'H1', tagIds: [t.id] }));
    await createContact(A, input({ name: 'H2', tagIds: [t.id] }));

    const tagsA = await listTags(A.teamId);
    expect(tagsA.find((x) => x.name === 'hitung-aku')?.contactCount).toBe(2);
    expect(tagsA.some((x) => x.name === 'rahasia-a')).toBe(true);

    const tagsB = await listTags(B.teamId);
    expect(tagsB.some((x) => x.name === 'rahasia-a')).toBe(false);
  });
});
