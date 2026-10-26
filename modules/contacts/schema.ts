import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  primaryKey,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Impor relatif: drizzle-kit tidak memahami alias '@/'.
import { teams, users, tenantIsolation } from '../../lib/db/schema';

export const CONTACT_KINDS = ['person', 'company'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

// Acuan: res.partner di Odoo. Satu tabel untuk perusahaan dan orang;
// orang bisa terhubung ke perusahaan. Pelanggan dan pemasok adalah peran, bukan tipe.
export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    kind: varchar('kind', { length: 10 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    companyId: integer('company_id'),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 50 }),
    address: text('address'),
    notes: text('notes'),
    isCustomer: boolean('is_customer').notNull().default(false),
    isSupplier: boolean('is_supplier').notNull().default(false),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    // Diarsipkan, bukan dihapus: modul lain (penjualan, faktur) akan merujuk kontak.
    archivedAt: timestamp('archived_at'),
  },
  (t) => [
    tenantIsolation(),
    // Target kunci asing komposit: menjamin referensi tidak melintasi toko.
    unique('contacts_id_team_unique').on(t.id, t.teamId),
    foreignKey({
      name: 'contacts_company_fk',
      columns: [t.companyId, t.teamId],
      foreignColumns: [t.id, t.teamId],
    }),
    check('contacts_kind_check', sql`${t.kind} in ('person', 'company')`),
    check('contacts_company_only_for_person', sql`${t.kind} = 'person' or ${t.companyId} is null`),
    index('contacts_team_name_idx').on(t.teamId, t.name),
  ]
);

export const contactTags = pgTable(
  'contact_tags',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 20 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    unique('contact_tags_id_team_unique').on(t.id, t.teamId),
    uniqueIndex('contact_tags_team_name_unique').on(t.teamId, sql`lower(${t.name})`),
  ]
);

export const contactTagLinks = pgTable(
  'contact_tag_links',
  {
    contactId: integer('contact_id').notNull(),
    tagId: integer('tag_id').notNull(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
  },
  (t) => [
    tenantIsolation(),
    primaryKey({ columns: [t.contactId, t.tagId] }),
    foreignKey({
      name: 'contact_tag_links_contact_fk',
      columns: [t.contactId, t.teamId],
      foreignColumns: [contacts.id, contacts.teamId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'contact_tag_links_tag_fk',
      columns: [t.tagId, t.teamId],
      foreignColumns: [contactTags.id, contactTags.teamId],
    }).onDelete('cascade'),
  ]
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactTag = typeof contactTags.$inferSelect;
