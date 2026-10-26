import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { users } from '@/lib/db/schema';
import {
  invProducts,
  invStockMovements,
  invVariants,
  type InvProduct,
  type InvStockMovement,
  type InvVariant,
  type MovementKind,
} from './schema';
import type {
  AdjustInput,
  ListQuery,
  MovementQuery,
  ProductInput,
  StockInput,
  VariantInput,
} from './schemas';

// Layanan inventori. Semua fungsi menerima toko aktif dari getTenantContext(); semua query memfilter
// team_id secara eksplisit (lapis 1) dan berjalan lewat withTenant (RLS, lapis 2).
//
// Stok tidak disimpan sebagai angka: ia adalah jumlah kolom `quantity` pada inv_stock_movements.
// Mutasi keluar diperiksa dan disisipkan dalam satu pernyataan setelah mengunci baris varian
// (SELECT ... FOR UPDATE), sehingga dua permintaan bersamaan tidak bisa membuat stok minus.

export type Actor = { teamId: number; userId: number };

export type InventoryErrorCode =
  | 'not_found'
  | 'variant_not_found'
  | 'archived'
  | 'sku_exists'
  | 'not_tracked'
  | 'insufficient_stock'
  | 'default_variant'
  | 'invalid_movement';

const DEFAULT_MESSAGES: Record<InventoryErrorCode, string> = {
  not_found: 'Product not found',
  variant_not_found: 'Variant not found',
  archived: 'Restore the product before changing it',
  sku_exists: 'Another variant already uses this SKU',
  not_tracked: 'This product does not track stock',
  insufficient_stock: 'Not enough stock',
  default_variant: 'The default variant cannot be archived',
  invalid_movement: 'Invalid stock movement',
};

export class InventoryError extends Error {
  constructor(
    public code: InventoryErrorCode,
    message?: string
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'InventoryError';
  }
}

const sqlState = (e: unknown): string | undefined =>
  (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

// ---------------------------------------------------------------------------
// Stok
// ---------------------------------------------------------------------------

// Fungsi publik untuk modul lain (Sales, Invoicing): stok saat ini per varian. Varian tanpa mutasi bernilai 0.
export async function getStockLevels(teamId: number, variantIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const unique = [...new Set(variantIds)];
  if (unique.length === 0) return map;
  for (const id of unique) map.set(id, 0);

  const [rows] = await withTenant(teamId, [
    db
      .select({
        variantId: invStockMovements.variantId,
        total: sql<number>`coalesce(sum(${invStockMovements.quantity}), 0)::float8`,
      })
      .from(invStockMovements)
      .where(and(eq(invStockMovements.teamId, teamId), inArray(invStockMovements.variantId, unique)))
      .groupBy(invStockMovements.variantId),
  ]);
  for (const r of rows) map.set(r.variantId, r.total);
  return map;
}

type VariantContext = {
  variant: InvVariant;
  product: InvProduct;
};

async function findVariant(teamId: number, variantId: number): Promise<VariantContext | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select({ variant: invVariants, product: invProducts })
      .from(invVariants)
      .innerJoin(invProducts, and(eq(invVariants.productId, invProducts.id), eq(invProducts.teamId, invVariants.teamId)))
      .where(and(eq(invVariants.id, variantId), eq(invVariants.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

const displayName = (ctx: VariantContext) =>
  ctx.variant.name ? `${ctx.product.name} (${ctx.variant.name})` : ctx.product.name;

const SIGN_OK: Record<MovementKind, (q: number) => boolean> = {
  receipt: (q) => q > 0,
  return: (q) => q > 0,
  issue: (q) => q < 0,
  sale: (q) => q < 0,
  adjustment: (q) => q !== 0,
};

export type MovementInput = {
  variantId: number;
  // Bertanda: masuk positif, keluar negatif. Tandanya harus sesuai `kind`.
  quantity: number;
  kind: MovementKind;
  note?: string | null;
  // Tautan ke dokumen asal, mis. { type: 'sale_order', id: 12 }.
  reference?: { type: string; id: number } | null;
};

type MovementRow = { id: number; quantity: number | string; created_at: string };

// Fungsi publik untuk modul lain: mencatat satu mutasi stok. Mutasi keluar ditolak (insufficient_stock)
// bila akan membuat stok minus. Satu varian dikunci selama pernyataan berjalan.
export async function recordMovement(actor: Actor, input: MovementInput): Promise<InvStockMovement> {
  const { teamId, userId } = actor;
  if (!Number.isFinite(input.quantity) || !SIGN_OK[input.kind](input.quantity)) {
    throw new InventoryError('invalid_movement', 'The quantity does not match the type of movement');
  }

  const ctx = await findVariant(teamId, input.variantId);
  if (!ctx) throw new InventoryError('variant_not_found');
  if (ctx.variant.archivedAt || ctx.product.archivedAt) throw new InventoryError('archived');
  if (!ctx.product.trackStock) throw new InventoryError('not_tracked');

  const quantity = input.quantity;
  const results = await withTenant(teamId, [
    // Kunci baris varian: permintaan lain untuk varian yang sama menunggu sampai transaksi ini selesai.
    db
      .select({ id: invVariants.id })
      .from(invVariants)
      .where(and(eq(invVariants.id, input.variantId), eq(invVariants.teamId, teamId)))
      .for('update'),
    db.execute(sql`
      insert into inv_stock_movements (team_id, variant_id, quantity, kind, note, reference_type, reference_id, created_by)
      select ${teamId}::int, ${input.variantId}::int, ${quantity}::numeric, ${input.kind}::text, ${input.note ?? null}::text,
             ${input.reference?.type ?? null}::text, ${input.reference?.id ?? null}::int, ${userId}::int
      where ${quantity}::numeric >= 0
         or coalesce((select sum(quantity) from inv_stock_movements
                      where team_id = ${teamId}::int and variant_id = ${input.variantId}::int), 0) + ${quantity}::numeric >= 0
      returning id, quantity, created_at
    `),
  ]);

  const rows = (results[1] as unknown as { rows: MovementRow[] }).rows;
  if (rows.length === 0) {
    const available = (await getStockLevels(teamId, [input.variantId])).get(input.variantId) ?? 0;
    throw new InventoryError(
      'insufficient_stock',
      `Not enough stock: ${available} available, ${Math.abs(quantity)} requested`
    );
  }

  const [movement] = await withTenant(teamId, [
    db
      .select()
      .from(invStockMovements)
      .where(and(eq(invStockMovements.id, rows[0].id), eq(invStockMovements.teamId, teamId))),
  ]);
  const created = movement[0];

  // Penjualan dan retur dicatat oleh modul pemiliknya; di sini hanya gerak langsung dari inventori.
  const auditAction: Partial<Record<MovementKind, string>> = {
    receipt: 'INVENTORY_STOCK_RECEIPT',
    issue: 'INVENTORY_STOCK_ISSUE',
    adjustment: 'INVENTORY_STOCK_ADJUSTMENT',
  };
  const action = auditAction[input.kind];
  if (action) {
    await withTenant(teamId, [
      auditEntry(teamId, userId, action, {
        entityType: 'inv_product',
        entityId: ctx.product.id,
        metadata: { name: displayName(ctx), quantity, variantId: input.variantId },
      }),
    ]);
  }
  return created;
}

export const receiveStock = (actor: Actor, input: StockInput) =>
  recordMovement(actor, { variantId: input.variantId, quantity: input.quantity, kind: 'receipt', note: input.note });

export const issueStock = (actor: Actor, input: StockInput) =>
  recordMovement(actor, { variantId: input.variantId, quantity: -input.quantity, kind: 'issue', note: input.note });

// Koreksi hasil hitung fisik: membuat mutasi selisih antara angka yang dihitung dan stok saat ini.
// Selisih dihitung di dalam pernyataan SQL setelah varian dikunci, jadi tidak basi bila ada mutasi bersamaan.
export async function adjustStock(actor: Actor, input: AdjustInput): Promise<{ movement: InvStockMovement | null; delta: number }> {
  const { teamId, userId } = actor;
  const ctx = await findVariant(teamId, input.variantId);
  if (!ctx) throw new InventoryError('variant_not_found');
  if (ctx.variant.archivedAt || ctx.product.archivedAt) throw new InventoryError('archived');
  if (!ctx.product.trackStock) throw new InventoryError('not_tracked');

  const results = await withTenant(teamId, [
    db
      .select({ id: invVariants.id })
      .from(invVariants)
      .where(and(eq(invVariants.id, input.variantId), eq(invVariants.teamId, teamId)))
      .for('update'),
    db.execute(sql`
      insert into inv_stock_movements (team_id, variant_id, quantity, kind, note, created_by)
      select ${teamId}::int, ${input.variantId}::int, ${input.countedQuantity}::numeric - cur.total, 'adjustment', ${input.note ?? null}::text, ${userId}::int
      from (select coalesce(sum(quantity), 0) as total from inv_stock_movements
            where team_id = ${teamId}::int and variant_id = ${input.variantId}::int) cur
      where ${input.countedQuantity}::numeric - cur.total <> 0
      returning id
    `),
  ]);

  const rows = (results[1] as unknown as { rows: { id: number }[] }).rows;
  if (rows.length === 0) return { movement: null, delta: 0 };

  const [found] = await withTenant(teamId, [
    db
      .select()
      .from(invStockMovements)
      .where(and(eq(invStockMovements.id, rows[0].id), eq(invStockMovements.teamId, teamId))),
  ]);
  const movement = found[0];
  await withTenant(teamId, [
    auditEntry(teamId, userId, 'INVENTORY_STOCK_ADJUSTMENT', {
      entityType: 'inv_product',
      entityId: ctx.product.id,
      metadata: { name: displayName(ctx), quantity: movement.quantity, variantId: input.variantId, counted: input.countedQuantity },
    }),
  ]);
  return { movement, delta: movement.quantity };
}

// ---------------------------------------------------------------------------
// Produk dan varian
// ---------------------------------------------------------------------------

async function findProduct(teamId: number, id: number): Promise<InvProduct | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(invProducts)
      .where(and(eq(invProducts.id, id), eq(invProducts.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

// Membuat produk beserta varian bawaannya. Varian membutuhkan id produk, jadi dua batch; bila varian
// gagal (SKU kembar) produk dibatalkan agar tidak tertinggal produk tanpa varian.
export async function createProduct(actor: Actor, input: ProductInput): Promise<InvProduct> {
  const { teamId, userId } = actor;
  const [[created]] = await withTenant(teamId, [
    db
      .insert(invProducts)
      .values({
        teamId,
        name: input.name,
        description: input.description,
        unit: input.unit,
        salePrice: input.salePrice,
        costPrice: input.costPrice,
        trackStock: input.trackStock,
        reorderLevel: input.reorderLevel,
        createdBy: userId,
      })
      .returning(),
  ]);

  try {
    await withTenant(teamId, [
      db.insert(invVariants).values({ teamId, productId: created.id, name: null, sku: input.sku, isDefault: true }),
      auditEntry(teamId, userId, 'INVENTORY_PRODUCT_CREATED', {
        entityType: 'inv_product',
        entityId: created.id,
        metadata: { name: created.name },
      }),
    ]);
  } catch (e) {
    await withTenant(teamId, [
      db.delete(invProducts).where(and(eq(invProducts.id, created.id), eq(invProducts.teamId, teamId))),
    ]).catch(() => undefined);
    if (sqlState(e) === '23505') throw new InventoryError('sku_exists');
    throw e;
  }
  return created;
}

export async function updateProduct(actor: Actor, id: number, input: ProductInput): Promise<InvProduct> {
  const { teamId, userId } = actor;
  const existing = await findProduct(teamId, id);
  if (!existing) throw new InventoryError('not_found');
  if (existing.archivedAt) throw new InventoryError('archived');

  try {
    const results = await withTenant(teamId, [
      db
        .update(invProducts)
        .set({
          name: input.name,
          description: input.description,
          unit: input.unit,
          salePrice: input.salePrice,
          costPrice: input.costPrice,
          trackStock: input.trackStock,
          reorderLevel: input.reorderLevel,
          updatedAt: new Date(),
        })
        .where(and(eq(invProducts.id, id), eq(invProducts.teamId, teamId)))
        .returning(),
      db
        .update(invVariants)
        .set({ sku: input.sku })
        .where(and(eq(invVariants.productId, id), eq(invVariants.teamId, teamId), eq(invVariants.isDefault, true))),
      auditEntry(teamId, userId, 'INVENTORY_PRODUCT_UPDATED', {
        entityType: 'inv_product',
        entityId: id,
        metadata: { name: input.name },
      }),
    ]);
    return (results[0] as InvProduct[])[0];
  } catch (e) {
    if (sqlState(e) === '23505') throw new InventoryError('sku_exists');
    throw e;
  }
}

async function setProductArchived(actor: Actor, id: number, archived: boolean): Promise<InvProduct> {
  const { teamId, userId } = actor;
  const existing = await findProduct(teamId, id);
  if (!existing) throw new InventoryError('not_found');
  if (Boolean(existing.archivedAt) === archived) return existing;

  const results = await withTenant(teamId, [
    db
      .update(invProducts)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(invProducts.id, id), eq(invProducts.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, archived ? 'INVENTORY_PRODUCT_ARCHIVED' : 'INVENTORY_PRODUCT_RESTORED', {
      entityType: 'inv_product',
      entityId: id,
      metadata: { name: existing.name },
    }),
  ]);
  return (results[0] as InvProduct[])[0];
}

export const archiveProduct = (actor: Actor, id: number) => setProductArchived(actor, id, true);
export const restoreProduct = (actor: Actor, id: number) => setProductArchived(actor, id, false);

export async function addVariant(actor: Actor, productId: number, input: VariantInput): Promise<InvVariant> {
  const { teamId, userId } = actor;
  const product = await findProduct(teamId, productId);
  if (!product) throw new InventoryError('not_found');
  if (product.archivedAt) throw new InventoryError('archived');

  try {
    const results = await withTenant(teamId, [
      db
        .insert(invVariants)
        .values({ teamId, productId, name: input.name, sku: input.sku, salePrice: input.salePrice, costPrice: input.costPrice })
        .returning(),
      auditEntry(teamId, userId, 'INVENTORY_VARIANT_ADDED', {
        entityType: 'inv_product',
        entityId: productId,
        metadata: { name: product.name, variant: input.name },
      }),
    ]);
    return (results[0] as InvVariant[])[0];
  } catch (e) {
    if (sqlState(e) === '23505') throw new InventoryError('sku_exists');
    throw e;
  }
}

// Varian bawaan tidak punya nama: namanya tetap null, hanya SKU dan harga yang bisa diubah.
export async function updateVariant(actor: Actor, variantId: number, input: VariantInput): Promise<InvVariant> {
  const { teamId, userId } = actor;
  const ctx = await findVariant(teamId, variantId);
  if (!ctx) throw new InventoryError('variant_not_found');
  if (ctx.product.archivedAt) throw new InventoryError('archived');

  try {
    const results = await withTenant(teamId, [
      db
        .update(invVariants)
        .set({
          name: ctx.variant.isDefault ? null : input.name,
          sku: input.sku,
          salePrice: input.salePrice,
          costPrice: input.costPrice,
        })
        .where(and(eq(invVariants.id, variantId), eq(invVariants.teamId, teamId)))
        .returning(),
      auditEntry(teamId, userId, 'INVENTORY_VARIANT_UPDATED', {
        entityType: 'inv_product',
        entityId: ctx.product.id,
        metadata: { name: ctx.product.name, variant: ctx.variant.isDefault ? 'Default' : input.name },
      }),
    ]);
    return (results[0] as InvVariant[])[0];
  } catch (e) {
    if (sqlState(e) === '23505') throw new InventoryError('sku_exists');
    throw e;
  }
}

async function setVariantArchived(actor: Actor, variantId: number, archived: boolean): Promise<InvVariant> {
  const { teamId, userId } = actor;
  const ctx = await findVariant(teamId, variantId);
  if (!ctx) throw new InventoryError('variant_not_found');
  if (archived && ctx.variant.isDefault) throw new InventoryError('default_variant');
  if (Boolean(ctx.variant.archivedAt) === archived) return ctx.variant;

  const results = await withTenant(teamId, [
    db
      .update(invVariants)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(invVariants.id, variantId), eq(invVariants.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, archived ? 'INVENTORY_VARIANT_ARCHIVED' : 'INVENTORY_VARIANT_RESTORED', {
      entityType: 'inv_product',
      entityId: ctx.product.id,
      metadata: { name: ctx.product.name, variant: ctx.variant.name },
    }),
  ]);
  return (results[0] as InvVariant[])[0];
}

export const archiveVariant = (actor: Actor, variantId: number) => setVariantArchived(actor, variantId, true);
export const restoreVariant = (actor: Actor, variantId: number) => setVariantArchived(actor, variantId, false);

// ---------------------------------------------------------------------------
// Daftar dan detail
// ---------------------------------------------------------------------------

// Total stok semua varian sebuah produk, sebagai potongan SQL untuk filter "stok menipis".
const productStock = (teamId: number) => sql`(
  select coalesce(sum(m.quantity), 0)
  from inv_stock_movements m
  join inv_variants v on v.id = m.variant_id and v.team_id = m.team_id
  where v.product_id = ${invProducts.id} and m.team_id = ${teamId}
)`;

export type ProductListItem = InvProduct & {
  sku: string | null;
  variantCount: number;
  stock: number;
  low: boolean;
};

export const isLowStock = (product: Pick<InvProduct, 'trackStock' | 'reorderLevel'>, stock: number) =>
  product.trackStock && product.reorderLevel !== null && stock <= product.reorderLevel;

export async function listProducts(teamId: number, query: ListQuery) {
  const conditions = [
    eq(invProducts.teamId, teamId),
    query.archived ? isNotNull(invProducts.archivedAt) : isNull(invProducts.archivedAt),
  ];
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`;
    conditions.push(
      or(
        ilike(invProducts.name, like),
        sql`exists (select 1 from inv_variants v where v.product_id = ${invProducts.id} and v.team_id = ${teamId} and v.sku ilike ${like})`
      )!
    );
  }
  if (query.lowStock) {
    conditions.push(
      sql`${invProducts.trackStock} and ${invProducts.reorderLevel} is not null and ${productStock(teamId)} <= ${invProducts.reorderLevel}`
    );
  }
  const where = and(...conditions);

  const [rows, [{ total }]] = await withTenant(teamId, [
    db
      .select()
      .from(invProducts)
      .where(where)
      .orderBy(asc(invProducts.name), asc(invProducts.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(invProducts).where(where),
  ]);

  const ids = rows.map((r) => r.id);
  let variants: { productId: number; id: number; sku: string | null; isDefault: boolean; archivedAt: Date | null }[] = [];
  if (ids.length > 0) {
    [variants] = await withTenant(teamId, [
      db
        .select({
          productId: invVariants.productId,
          id: invVariants.id,
          sku: invVariants.sku,
          isDefault: invVariants.isDefault,
          archivedAt: invVariants.archivedAt,
        })
        .from(invVariants)
        .where(and(eq(invVariants.teamId, teamId), inArray(invVariants.productId, ids))),
    ]);
  }
  const stock = await getStockLevels(teamId, variants.map((v) => v.id));

  const items: ProductListItem[] = rows.map((p) => {
    const mine = variants.filter((v) => v.productId === p.id);
    const totalStock = mine.reduce((n, v) => n + (stock.get(v.id) ?? 0), 0);
    return {
      ...p,
      sku: mine.find((v) => v.isDefault)?.sku ?? null,
      variantCount: mine.filter((v) => !v.archivedAt).length,
      stock: Math.round(totalStock * 1000) / 1000,
      low: isLowStock(p, totalStock),
    };
  });

  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export type VariantDetail = InvVariant & { stock: number; effectiveSalePrice: number; effectiveCostPrice: number };

export async function getProduct(teamId: number, id: number) {
  const product = await findProduct(teamId, id);
  if (!product) return null;

  const [variantRows] = await withTenant(teamId, [
    db
      .select()
      .from(invVariants)
      .where(and(eq(invVariants.productId, id), eq(invVariants.teamId, teamId)))
      .orderBy(desc(invVariants.isDefault), asc(invVariants.id)),
  ]);
  const stock = await getStockLevels(teamId, variantRows.map((v) => v.id));

  const variants: VariantDetail[] = variantRows.map((v) => ({
    ...v,
    stock: stock.get(v.id) ?? 0,
    effectiveSalePrice: v.salePrice ?? product.salePrice,
    effectiveCostPrice: v.costPrice ?? product.costPrice,
  }));
  const totalStock = Math.round(variants.reduce((n, v) => n + v.stock, 0) * 1000) / 1000;

  return { ...product, variants, stock: totalStock, low: isLowStock(product, totalStock) };
}

export type MovementListItem = InvStockMovement & {
  productId: number;
  productName: string;
  variantName: string | null;
  sku: string | null;
  userName: string | null;
};

export async function listMovements(teamId: number, query: MovementQuery) {
  const conditions = [eq(invStockMovements.teamId, teamId)];
  if (query.variantId) conditions.push(eq(invStockMovements.variantId, query.variantId));
  if (query.productId) conditions.push(eq(invVariants.productId, query.productId));
  const where = and(...conditions);

  const [rows, [{ total }]] = await withTenant(teamId, [
    db
      .select({
        movement: invStockMovements,
        productId: invProducts.id,
        productName: invProducts.name,
        variantName: invVariants.name,
        sku: invVariants.sku,
      })
      .from(invStockMovements)
      .innerJoin(
        invVariants,
        and(eq(invStockMovements.variantId, invVariants.id), eq(invVariants.teamId, invStockMovements.teamId))
      )
      .innerJoin(invProducts, and(eq(invVariants.productId, invProducts.id), eq(invProducts.teamId, invVariants.teamId)))
      .where(where)
      .orderBy(desc(invStockMovements.createdAt), desc(invStockMovements.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(invStockMovements)
      .innerJoin(
        invVariants,
        and(eq(invStockMovements.variantId, invVariants.id), eq(invVariants.teamId, invStockMovements.teamId))
      )
      .where(where),
  ]);

  const userIds = [...new Set(rows.map((r) => r.movement.createdBy).filter((i): i is number => i !== null))];
  const names = new Map<number, string>();
  if (userIds.length > 0) {
    const people = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const p of people) names.set(p.id, p.name || p.email);
  }

  const items: MovementListItem[] = rows.map((r) => ({
    ...r.movement,
    productId: r.productId,
    productName: r.productName,
    variantName: r.variantName,
    sku: r.sku,
    userName: r.movement.createdBy ? (names.get(r.movement.createdBy) ?? null) : null,
  }));

  return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.max(1, Math.ceil(total / query.pageSize)) };
}
