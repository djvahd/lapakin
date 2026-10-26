import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
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

export const MOVEMENT_KINDS = ['receipt', 'issue', 'adjustment', 'sale', 'return'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
const quantity = (name: string) => numeric(name, { precision: 14, scale: 3, mode: 'number' });

// Produk (product.template di Odoo). Yang bisa dijual dan dihitung stoknya adalah varian.
export const invProducts = pgTable(
  'inv_products',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    unit: varchar('unit', { length: 20 }).notNull().default('pcs'),
    salePrice: money('sale_price').notNull().default(0),
    costPrice: money('cost_price').notNull().default(0),
    // false untuk jasa: tidak punya stok dan tidak boleh dimutasi.
    trackStock: boolean('track_stock').notNull().default(true),
    // Total stok semua varian pada atau di bawah angka ini dianggap menipis; null berarti tidak dipantau.
    reorderLevel: quantity('reorder_level'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    archivedAt: timestamp('archived_at'),
  },
  (t) => [
    tenantIsolation(),
    unique('inv_products_id_team_unique').on(t.id, t.teamId),
    check('inv_products_prices_check', sql`${t.salePrice} >= 0 and ${t.costPrice} >= 0`),
    check('inv_products_reorder_check', sql`${t.reorderLevel} is null or ${t.reorderLevel} >= 0`),
    index('inv_products_team_name_idx').on(t.teamId, t.name),
  ]
);

// Varian (product.product di Odoo). Setiap produk punya tepat satu varian bawaan; sisanya opsional.
export const invVariants = pgTable(
  'inv_variants',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    productId: integer('product_id').notNull(),
    // Nama varian ("Merah / L"); null pada varian bawaan.
    name: varchar('name', { length: 100 }),
    sku: varchar('sku', { length: 64 }),
    // Menimpa harga produk bila diisi.
    salePrice: money('sale_price'),
    costPrice: money('cost_price'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    archivedAt: timestamp('archived_at'),
  },
  (t) => [
    tenantIsolation(),
    unique('inv_variants_id_team_unique').on(t.id, t.teamId),
    foreignKey({
      name: 'inv_variants_product_fk',
      columns: [t.productId, t.teamId],
      foreignColumns: [invProducts.id, invProducts.teamId],
    }),
    // SKU unik per toko tanpa membedakan huruf besar kecil; boleh kosong.
    uniqueIndex('inv_variants_team_sku_unique')
      .on(t.teamId, sql`lower(${t.sku})`)
      .where(sql`${t.sku} is not null`),
    // Tepat satu varian bawaan per produk.
    uniqueIndex('inv_variants_one_default_unique')
      .on(t.productId)
      .where(sql`${t.isDefault}`),
    check('inv_variants_prices_check', sql`(${t.salePrice} is null or ${t.salePrice} >= 0) and (${t.costPrice} is null or ${t.costPrice} >= 0)`),
    index('inv_variants_product_idx').on(t.productId),
  ]
);

// Buku besar stok (stock.move di Odoo). Stok adalah jumlah kolom `quantity`, tidak pernah disimpan
// sebagai angka. Mutasi tidak diubah atau dihapus; koreksi dibuat sebagai mutasi baru.
export const invStockMovements = pgTable(
  'inv_stock_movements',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    variantId: integer('variant_id').notNull(),
    // Bertanda: masuk positif, keluar negatif.
    quantity: quantity('quantity').notNull(),
    kind: varchar('kind', { length: 12 }).notNull(),
    note: varchar('note', { length: 500 }),
    // Tautan ke dokumen asal (mis. pesanan penjualan) untuk modul lain.
    referenceType: varchar('reference_type', { length: 30 }),
    referenceId: integer('reference_id'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    foreignKey({
      name: 'inv_stock_movements_variant_fk',
      columns: [t.variantId, t.teamId],
      foreignColumns: [invVariants.id, invVariants.teamId],
    }),
    check('inv_stock_movements_kind_check', sql`${t.kind} in ('receipt', 'issue', 'adjustment', 'sale', 'return')`),
    // Tanda mengikuti jenis: masuk positif, keluar negatif, penyesuaian boleh keduanya tetapi bukan nol.
    check(
      'inv_stock_movements_sign_check',
      sql`(${t.kind} in ('receipt', 'return') and ${t.quantity} > 0) or (${t.kind} in ('issue', 'sale') and ${t.quantity} < 0) or (${t.kind} = 'adjustment' and ${t.quantity} <> 0)`
    ),
    index('inv_stock_movements_variant_idx').on(t.teamId, t.variantId),
    index('inv_stock_movements_created_idx').on(t.teamId, t.createdAt),
  ]
);

export type InvProduct = typeof invProducts.$inferSelect;
export type InvVariant = typeof invVariants.$inferSelect;
export type InvStockMovement = typeof invStockMovements.$inferSelect;
