import { and, asc, eq, exists, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { contacts, contactTags, contactTagLinks, type Contact, type ContactTag } from './schema';
import type { ContactInput, ListQuery, TagInput } from './schemas';

// Layanan kontak. Semua fungsi menerima toko aktif dari getTenantContext(); semua query
// memfilter team_id secara eksplisit (lapis 1) dan berjalan lewat withTenant (RLS, lapis 2).
// Input diasumsikan sudah lolos contactInputSchema / listQuerySchema / tagInputSchema.

type Queries = [BatchItem<'pg'>, ...BatchItem<'pg'>[]];
export type Actor = { teamId: number; userId: number };

export type ContactErrorCode =
  | 'not_found'
  | 'archived'
  | 'invalid_company'
  | 'company_has_people'
  | 'invalid_tag'
  | 'tag_not_found'
  | 'tag_exists';

const DEFAULT_MESSAGES: Record<ContactErrorCode, string> = {
  not_found: 'Contact not found',
  archived: 'Restore the contact before editing',
  invalid_company: 'Company not found',
  company_has_people: 'This company still has people linked to it',
  invalid_tag: 'Tag not found',
  tag_not_found: 'Tag not found',
  tag_exists: 'A tag with this name already exists',
};

export class ContactError extends Error {
  constructor(
    public code: ContactErrorCode,
    message?: string
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'ContactError';
  }
}

const sqlState = (e: unknown): string | undefined =>
  (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;

const fieldsOf = (i: ContactInput) => ({
  kind: i.kind,
  name: i.name,
  companyId: i.companyId,
  email: i.email,
  phone: i.phone,
  address: i.address,
  notes: i.notes,
  isCustomer: i.isCustomer,
  isSupplier: i.isSupplier,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export type TagSummary = { id: number; name: string; color: string | null };
export type ContactListItem = Contact & { companyName: string | null; tags: TagSummary[] };

async function findRow(teamId: number, id: number): Promise<Contact | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

async function tagsFor(teamId: number, contactIds: number[]) {
  const map = new Map<number, TagSummary[]>();
  if (contactIds.length === 0) return map;
  const [rows] = await withTenant(teamId, [
    db
      .select({
        contactId: contactTagLinks.contactId,
        id: contactTags.id,
        name: contactTags.name,
        color: contactTags.color,
      })
      .from(contactTagLinks)
      .innerJoin(
        contactTags,
        and(eq(contactTagLinks.tagId, contactTags.id), eq(contactTags.teamId, contactTagLinks.teamId))
      )
      .where(and(eq(contactTagLinks.teamId, teamId), inArray(contactTagLinks.contactId, contactIds)))
      .orderBy(asc(contactTags.name)),
  ]);
  for (const r of rows) {
    const list = map.get(r.contactId) ?? [];
    list.push({ id: r.id, name: r.name, color: r.color });
    map.set(r.contactId, list);
  }
  return map;
}

async function assertCompany(teamId: number, companyId: number | null, selfId?: number) {
  if (companyId === null) return;
  if (companyId === selfId) {
    throw new ContactError('invalid_company', 'A contact cannot belong to itself');
  }
  const company = await findRow(teamId, companyId);
  if (!company || company.kind !== 'company' || company.archivedAt) {
    throw new ContactError('invalid_company', 'Company not found');
  }
}

async function assertTags(teamId: number, tagIds: number[]) {
  if (tagIds.length === 0) return;
  const [[row]] = await withTenant(teamId, [
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contactTags)
      .where(and(eq(contactTags.teamId, teamId), inArray(contactTags.id, tagIds))),
  ]);
  if (row.n !== tagIds.length) throw new ContactError('invalid_tag', 'Tag not found');
}

export async function listContacts(teamId: number, query: ListQuery) {
  const company = alias(contacts, 'company');

  const conditions = [
    eq(contacts.teamId, teamId),
    query.archived ? isNotNull(contacts.archivedAt) : isNull(contacts.archivedAt),
  ];
  if (query.kind) conditions.push(eq(contacts.kind, query.kind));
  if (query.role === 'customer') conditions.push(eq(contacts.isCustomer, true));
  if (query.role === 'supplier') conditions.push(eq(contacts.isSupplier, true));
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    conditions.push(
      or(ilike(contacts.name, like), ilike(contacts.email, like), ilike(contacts.phone, like))!
    );
  }
  if (query.tagId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(contactTagLinks)
          .where(
            and(
              eq(contactTagLinks.contactId, contacts.id),
              eq(contactTagLinks.teamId, teamId),
              eq(contactTagLinks.tagId, query.tagId)
            )
          )
      )
    );
  }
  const where = and(...conditions);

  const [rows, [{ total }]] = await withTenant(teamId, [
    db
      .select({ contact: contacts, companyName: company.name })
      .from(contacts)
      .leftJoin(company, and(eq(contacts.companyId, company.id), eq(company.teamId, contacts.teamId)))
      .where(where)
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(contacts).where(where),
  ]);

  const tags = await tagsFor(teamId, rows.map((r) => r.contact.id));
  const items: ContactListItem[] = rows.map((r) => ({
    ...r.contact,
    companyName: r.companyName,
    tags: tags.get(r.contact.id) ?? [],
  }));

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getContact(teamId: number, id: number) {
  const row = await findRow(teamId, id);
  if (!row) return null;

  const [company, people, tags] = await Promise.all([
    row.companyId ? findRow(teamId, row.companyId) : Promise.resolve(null),
    row.kind === 'company'
      ? withTenant(teamId, [
          db
            .select({ id: contacts.id, name: contacts.name, email: contacts.email })
            .from(contacts)
            .where(
              and(eq(contacts.companyId, id), eq(contacts.teamId, teamId), isNull(contacts.archivedAt))
            )
            .orderBy(asc(contacts.name)),
        ]).then(([rows]) => rows)
      : Promise.resolve([]),
    tagsFor(teamId, [id]),
  ]);

  return { ...row, companyName: company?.name ?? null, people, tags: tags.get(id) ?? [] };
}

export async function createContact(actor: Actor, input: ContactInput): Promise<Contact> {
  const { teamId, userId } = actor;
  await assertCompany(teamId, input.companyId);
  await assertTags(teamId, input.tagIds);

  const [[created]] = await withTenant(teamId, [
    db
      .insert(contacts)
      .values({ teamId, ...fieldsOf(input), createdBy: userId })
      .returning(),
  ]);

  // Tag dan audit butuh id kontak, jadi di batch kedua. Bila gagal, kontak dibatalkan.
  try {
    const queries: Queries = [
      auditEntry(teamId, userId, 'CONTACT_CREATED', {
        entityType: 'contact',
        entityId: created.id,
        metadata: { name: created.name, kind: created.kind },
      }),
    ];
    if (input.tagIds.length > 0) {
      queries.unshift(
        db
          .insert(contactTagLinks)
          .values(input.tagIds.map((tagId) => ({ contactId: created.id, tagId, teamId })))
      );
    }
    await withTenant(teamId, queries);
  } catch (e) {
    await withTenant(teamId, [
      db.delete(contacts).where(and(eq(contacts.id, created.id), eq(contacts.teamId, teamId))),
    ]).catch(() => undefined);
    throw e;
  }
  return created;
}

export async function updateContact(actor: Actor, id: number, input: ContactInput): Promise<Contact> {
  const { teamId, userId } = actor;
  const existing = await findRow(teamId, id);
  if (!existing) throw new ContactError('not_found');
  if (existing.archivedAt) throw new ContactError('archived', 'Restore the contact before editing');

  await assertCompany(teamId, input.companyId, id);
  await assertTags(teamId, input.tagIds);

  if (existing.kind === 'company' && input.kind !== 'company') {
    const [[row]] = await withTenant(teamId, [
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(contacts)
        .where(and(eq(contacts.companyId, id), eq(contacts.teamId, teamId))),
    ]);
    if (row.n > 0) {
      throw new ContactError('company_has_people', 'This company still has people linked to it');
    }
  }

  // Satu transaksi: ubah kontak, ganti tag, dan catat audit.
  const queries: Queries = [
    db
      .update(contacts)
      .set({ ...fieldsOf(input), updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.teamId, teamId)))
      .returning(),
    db
      .delete(contactTagLinks)
      .where(and(eq(contactTagLinks.contactId, id), eq(contactTagLinks.teamId, teamId))),
  ];
  if (input.tagIds.length > 0) {
    queries.push(
      db
        .insert(contactTagLinks)
        .values(input.tagIds.map((tagId) => ({ contactId: id, tagId, teamId })))
    );
  }
  queries.push(
    auditEntry(teamId, userId, 'CONTACT_UPDATED', {
      entityType: 'contact',
      entityId: id,
      metadata: { name: input.name },
    })
  );

  const results = await withTenant(teamId, queries);
  return (results[0] as Contact[])[0];
}

async function setArchived(actor: Actor, id: number, archived: boolean): Promise<Contact> {
  const { teamId, userId } = actor;
  const existing = await findRow(teamId, id);
  if (!existing) throw new ContactError('not_found');
  if (Boolean(existing.archivedAt) === archived) return existing;

  const results = await withTenant(teamId, [
    db
      .update(contacts)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, archived ? 'CONTACT_ARCHIVED' : 'CONTACT_RESTORED', {
      entityType: 'contact',
      entityId: id,
      metadata: { name: existing.name },
    }),
  ]);
  return (results[0] as Contact[])[0];
}

export const archiveContact = (actor: Actor, id: number) => setArchived(actor, id, true);
export const restoreContact = (actor: Actor, id: number) => setArchived(actor, id, false);

export async function listTags(teamId: number) {
  const [rows] = await withTenant(teamId, [
    db
      .select({
        id: contactTags.id,
        name: contactTags.name,
        color: contactTags.color,
        contactCount: sql<number>`count(${contactTagLinks.contactId})::int`,
      })
      .from(contactTags)
      .leftJoin(
        contactTagLinks,
        and(eq(contactTagLinks.tagId, contactTags.id), eq(contactTagLinks.teamId, contactTags.teamId))
      )
      .where(eq(contactTags.teamId, teamId))
      .groupBy(contactTags.id)
      .orderBy(asc(contactTags.name)),
  ]);
  return rows;
}

export async function createTag(actor: Actor, input: TagInput) {
  const { teamId, userId } = actor;
  try {
    const [[tag]] = await withTenant(teamId, [
      db.insert(contactTags).values({ teamId, name: input.name, color: input.color }).returning(),
    ]);
    await withTenant(teamId, [
      auditEntry(teamId, userId, 'CONTACT_TAG_CREATED', {
        entityType: 'contact_tag',
        entityId: tag.id,
        metadata: { name: tag.name },
      }),
    ]);
    return tag;
  } catch (e) {
    if (sqlState(e) === '23505') throw new ContactError('tag_exists', 'A tag with this name already exists');
    throw e;
  }
}

async function findTag(teamId: number, id: number): Promise<ContactTag | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(contactTags)
      .where(and(eq(contactTags.id, id), eq(contactTags.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

export async function updateTag(actor: Actor, id: number, input: TagInput): Promise<ContactTag> {
  const { teamId, userId } = actor;
  const existing = await findTag(teamId, id);
  if (!existing) throw new ContactError('tag_not_found');

  try {
    const results = await withTenant(teamId, [
      db
        .update(contactTags)
        .set({ name: input.name, color: input.color })
        .where(and(eq(contactTags.id, id), eq(contactTags.teamId, teamId)))
        .returning(),
      auditEntry(teamId, userId, 'CONTACT_TAG_UPDATED', {
        entityType: 'contact_tag',
        entityId: id,
        metadata: { name: input.name, previousName: existing.name },
      }),
    ]);
    return (results[0] as ContactTag[])[0];
  } catch (e) {
    if (sqlState(e) === '23505') throw new ContactError('tag_exists');
    throw e;
  }
}

// Menghapus tag melepasnya dari semua kontak (kunci asing cascade); kontaknya tetap ada.
export async function deleteTag(actor: Actor, id: number): Promise<{ removedFrom: number }> {
  const { teamId, userId } = actor;
  const existing = await findTag(teamId, id);
  if (!existing) throw new ContactError('tag_not_found');

  const [[usage]] = await withTenant(teamId, [
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contactTagLinks)
      .where(and(eq(contactTagLinks.tagId, id), eq(contactTagLinks.teamId, teamId))),
  ]);

  await withTenant(teamId, [
    db.delete(contactTags).where(and(eq(contactTags.id, id), eq(contactTags.teamId, teamId))),
    auditEntry(teamId, userId, 'CONTACT_TAG_DELETED', {
      entityType: 'contact_tag',
      entityId: id,
      metadata: { name: existing.name, contactCount: usage.n },
    }),
  ]);
  return { removedFrom: usage.n };
}

// Fungsi publik untuk modul lain (CRM, Sales, Invoicing): nama kontak berdasarkan id, tanpa
// membaca tabel kontak langsung. Kontak toko lain tidak pernah muncul; id yang tidak ada dilewati.
export async function getContactNames(
  teamId: number,
  ids: number[]
): Promise<Map<number, { name: string; archived: boolean }>> {
  const map = new Map<number, { name: string; archived: boolean }>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const [rows] = await withTenant(teamId, [
    db
      .select({ id: contacts.id, name: contacts.name, archivedAt: contacts.archivedAt })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, unique))),
  ]);
  for (const r of rows) map.set(r.id, { name: r.name, archived: r.archivedAt !== null });
  return map;
}
