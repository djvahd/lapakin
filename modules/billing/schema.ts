import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  numeric,
  timestamp,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Impor relatif: drizzle-kit tidak memahami alias '@/'.
import { teams, users, tenantIsolation } from '../../lib/db/schema';
import { contacts } from '../contacts/schema';
import { salesLines, salesOrders } from '../sales/schema';

// Modul Invoicing memakai awalan `bill_` karena `inv_` sudah dipakai Inventory.
// draft: bisa diubah; issued: terkunci dan ditagih; void: dibatalkan (hanya bila belum ada pembayaran).
// Status bayar (belum, sebagian, lunas, jatuh tempo) dihitung dari pembayaran, tidak disimpan.
export const INVOICE_STATUSES = ['draft', 'issued', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['transfer', 'cash', 'card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });

export const billInvoices = pgTable(
  'bill_invoices',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    // Nomor urut per toko, ditampilkan sebagai F0001.
    number: integer('number').notNull(),
    orderId: integer('order_id').notNull(),
    contactId: integer('contact_id').notNull(),
    status: varchar('status', { length: 10 }).notNull().default('draft'),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    notes: text('notes'),
    issuedAt: timestamp('issued_at'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    unique('bill_invoices_id_team_unique').on(t.id, t.teamId),
    uniqueIndex('bill_invoices_team_number_unique').on(t.teamId, t.number),
    foreignKey({
      name: 'bill_invoices_order_fk',
      columns: [t.orderId, t.teamId],
      foreignColumns: [salesOrders.id, salesOrders.teamId],
    }),
    foreignKey({
      name: 'bill_invoices_contact_fk',
      columns: [t.contactId, t.teamId],
      foreignColumns: [contacts.id, contacts.teamId],
    }),
    check('bill_invoices_status_check', sql`${t.status} in ('draft', 'issued', 'void')`),
    check('bill_invoices_due_check', sql`${t.dueDate} >= ${t.issueDate}`),
    index('bill_invoices_team_status_idx').on(t.teamId, t.status),
    index('bill_invoices_order_idx').on(t.orderId),
  ]
);

// Baris faktur menyalin baris pesanan (deskripsi, harga, diskon) agar faktur yang sudah terbit tidak
// berubah bila pesanan berubah. Jumlah yang ditagih tidak boleh melebihi jumlah pesanan.
export const billLines = pgTable(
  'bill_lines',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    invoiceId: integer('invoice_id').notNull(),
    orderLineId: integer('order_line_id').notNull(),
    description: varchar('description', { length: 300 }).notNull(),
    position: integer('position').notNull(),
    quantity: quantity('quantity').notNull(),
    unitPrice: money('unit_price').notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
  },
  (t) => [
    tenantIsolation(),
    foreignKey({
      name: 'bill_lines_invoice_fk',
      columns: [t.invoiceId, t.teamId],
      foreignColumns: [billInvoices.id, billInvoices.teamId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'bill_lines_order_line_fk',
      columns: [t.orderLineId, t.teamId],
      foreignColumns: [salesLines.id, salesLines.teamId],
    }),
    check('bill_lines_amounts_check', sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discountPct} between 0 and 100`),
    index('bill_lines_invoice_idx').on(t.invoiceId),
    index('bill_lines_order_line_idx').on(t.orderLineId),
  ]
);

// Pembayaran (bisa sebagian). Hanya bertambah: aplikasi tidak mengubah atau menghapusnya (lihat migrasi).
export const billPayments = pgTable(
  'bill_payments',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    invoiceId: integer('invoice_id').notNull(),
    amount: money('amount').notNull(),
    paidOn: date('paid_on').notNull(),
    method: varchar('method', { length: 10 }).notNull().default('transfer'),
    note: varchar('note', { length: 500 }),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    foreignKey({
      name: 'bill_payments_invoice_fk',
      columns: [t.invoiceId, t.teamId],
      foreignColumns: [billInvoices.id, billInvoices.teamId],
    }),
    check('bill_payments_amount_check', sql`${t.amount} > 0`),
    check('bill_payments_method_check', sql`${t.method} in ('transfer', 'cash', 'card', 'other')`),
    index('bill_payments_invoice_idx').on(t.invoiceId),
  ]
);

export type BillInvoice = typeof billInvoices.$inferSelect;
export type BillLine = typeof billLines.$inferSelect;
export type BillPayment = typeof billPayments.$inferSelect;
