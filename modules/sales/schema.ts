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
import { crmOpportunities } from '../crm/schema';
import { invVariants } from '../inventory/schema';

// Satu dokumen untuk penawaran dan pesanan, seperti sale.order di Odoo: penawaran menjadi pesanan
// saat dikonfirmasi. draft -> sent -> confirmed; sent atau draft bisa ditolak; pesanan bisa dibatalkan
// selama belum ada pengiriman.
export const ORDER_STATUSES = ['draft', 'sent', 'rejected', 'confirmed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });

export const salesOrders = pgTable(
  'sales_orders',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    // Nomor urut per toko, ditampilkan sebagai S0001.
    number: integer('number').notNull(),
    contactId: integer('contact_id').notNull(),
    opportunityId: integer('opportunity_id'),
    status: varchar('status', { length: 12 }).notNull().default('draft'),
    issueDate: date('issue_date').notNull(),
    validUntil: date('valid_until'),
    notes: text('notes'),
    confirmedAt: timestamp('confirmed_at'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    unique('sales_orders_id_team_unique').on(t.id, t.teamId),
    uniqueIndex('sales_orders_team_number_unique').on(t.teamId, t.number),
    foreignKey({
      name: 'sales_orders_contact_fk',
      columns: [t.contactId, t.teamId],
      foreignColumns: [contacts.id, contacts.teamId],
    }),
    foreignKey({
      name: 'sales_orders_opportunity_fk',
      columns: [t.opportunityId, t.teamId],
      foreignColumns: [crmOpportunities.id, crmOpportunities.teamId],
    }),
    check('sales_orders_status_check', sql`${t.status} in ('draft', 'sent', 'rejected', 'confirmed', 'cancelled')`),
    check('sales_orders_valid_until_check', sql`${t.validUntil} is null or ${t.validUntil} >= ${t.issueDate}`),
    index('sales_orders_team_status_idx').on(t.teamId, t.status),
    index('sales_orders_team_contact_idx').on(t.teamId, t.contactId),
  ]
);

export const salesLines = pgTable(
  'sales_lines',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    orderId: integer('order_id').notNull(),
    // Kosong untuk baris bebas (mis. ongkos kirim); baris berstok mengacu ke varian Inventory.
    variantId: integer('variant_id'),
    description: varchar('description', { length: 300 }).notNull(),
    position: integer('position').notNull(),
    quantity: quantity('quantity').notNull(),
    unitPrice: money('unit_price').notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
  },
  (t) => [
    tenantIsolation(),
    unique('sales_lines_id_team_unique').on(t.id, t.teamId),
    foreignKey({
      name: 'sales_lines_order_fk',
      columns: [t.orderId, t.teamId],
      foreignColumns: [salesOrders.id, salesOrders.teamId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sales_lines_variant_fk',
      columns: [t.variantId, t.teamId],
      foreignColumns: [invVariants.id, invVariants.teamId],
    }),
    check('sales_lines_amounts_check', sql`${t.quantity} > 0 and ${t.unitPrice} >= 0 and ${t.discountPct} between 0 and 100`),
    index('sales_lines_order_idx').on(t.orderId),
  ]
);

export const salesDeliveries = pgTable(
  'sales_deliveries',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    orderId: integer('order_id').notNull(),
    deliveredAt: timestamp('delivered_at').notNull().defaultNow(),
    note: varchar('note', { length: 500 }),
    createdBy: integer('created_by').references(() => users.id),
  },
  (t) => [
    tenantIsolation(),
    unique('sales_deliveries_id_team_unique').on(t.id, t.teamId),
    foreignKey({
      name: 'sales_deliveries_order_fk',
      columns: [t.orderId, t.teamId],
      foreignColumns: [salesOrders.id, salesOrders.teamId],
    }),
    index('sales_deliveries_order_idx').on(t.orderId),
  ]
);

export const salesDeliveryLines = pgTable(
  'sales_delivery_lines',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    deliveryId: integer('delivery_id').notNull(),
    orderLineId: integer('order_line_id').notNull(),
    quantity: quantity('quantity').notNull(),
  },
  (t) => [
    tenantIsolation(),
    foreignKey({
      name: 'sales_delivery_lines_delivery_fk',
      columns: [t.deliveryId, t.teamId],
      foreignColumns: [salesDeliveries.id, salesDeliveries.teamId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'sales_delivery_lines_line_fk',
      columns: [t.orderLineId, t.teamId],
      foreignColumns: [salesLines.id, salesLines.teamId],
    }),
    check('sales_delivery_lines_quantity_check', sql`${t.quantity} > 0`),
    index('sales_delivery_lines_delivery_idx').on(t.deliveryId),
    index('sales_delivery_lines_line_idx').on(t.orderLineId),
  ]
);

export type SalesOrder = typeof salesOrders.$inferSelect;
export type SalesLine = typeof salesLines.$inferSelect;
export type SalesDelivery = typeof salesDeliveries.$inferSelect;
export type SalesDeliveryLine = typeof salesDeliveryLines.$inferSelect;
