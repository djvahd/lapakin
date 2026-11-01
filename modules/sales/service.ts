import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { getContact, getContactNames } from '@/modules/contacts/service';
import { getOpportunity } from '@/modules/crm/service';
import { InventoryError, findVariant, getStockLevels, recordMovement } from '@/modules/inventory/service';
import {
  salesDeliveries,
  salesDeliveryLines,
  salesLines,
  salesOrders,
  type OrderStatus,
  type SalesDelivery,
  type SalesLine,
  type SalesOrder,
} from './schema';
import type { DeliveryInput, LineInput, ListQuery, OrderInput } from './schemas';

// Layanan penjualan. Penawaran dan pesanan adalah satu dokumen (sales_orders) dengan status.
// Stok berkurang saat pengiriman dicatat, bukan saat pesanan dikonfirmasi: pesanan yang belum
// dikirim tidak mengunci stok. Semua query memfilter team_id (lapis 1) dan berjalan lewat withTenant (RLS).

export type Actor = { teamId: number; userId: number };

export type SalesErrorCode =
  | 'not_found'
  | 'invalid_contact'
  | 'invalid_opportunity'
  | 'invalid_variant'
  | 'invalid_status'
  | 'has_deliveries'
  | 'invalid_line'
  | 'over_delivery'
  | 'insufficient_stock'
  | 'number_conflict';

const DEFAULT_MESSAGES: Record<SalesErrorCode, string> = {
  not_found: 'Order not found',
  invalid_contact: 'Choose an active contact',
  invalid_opportunity: 'Opportunity not found',
  invalid_variant: 'Choose an active product',
  invalid_status: 'This action is not allowed in the current status',
  has_deliveries: 'An order with deliveries cannot be cancelled',
  invalid_line: 'Line not found on this order',
  over_delivery: 'Cannot deliver more than was ordered',
  insufficient_stock: 'Not enough stock',
  number_conflict: 'Could not allocate an order number, try again',
};

export class SalesError extends Error {
  constructor(
    public code: SalesErrorCode,
    message?: string
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'SalesError';
  }
}

const sqlState = (e: unknown): string | undefined =>
  (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Jumlah baris setelah diskon, dibulatkan per baris.
export const lineTotal = (l: Pick<SalesLine, 'quantity' | 'unitPrice' | 'discountPct'>) =>
  round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));

const EDITABLE: OrderStatus[] = ['draft', 'sent'];

// ---------------------------------------------------------------------------
// Validasi dan pencarian
// ---------------------------------------------------------------------------

async function assertInputs(teamId: number, input: OrderInput) {
  const contact = await getContact(teamId, input.contactId);
  if (!contact || contact.archivedAt) throw new SalesError('invalid_contact');
  if (input.opportunityId !== null && !(await getOpportunity(teamId, input.opportunityId))) {
    throw new SalesError('invalid_opportunity');
  }
  for (const id of new Set(input.lines.map((l) => l.variantId).filter((v): v is number => v !== null))) {
    const ctx = await findVariant(teamId, id);
    if (!ctx || ctx.variant.archivedAt || ctx.product.archivedAt) throw new SalesError('invalid_variant');
  }
}

const lineRows = (teamId: number, orderId: number, lines: LineInput[]) =>
  lines.map((l, i) => ({
    teamId,
    orderId,
    variantId: l.variantId,
    description: l.description,
    position: i + 1,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
  }));

async function findOrder(teamId: number, id: number): Promise<SalesOrder | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(salesOrders)
      .where(and(eq(salesOrders.id, id), eq(salesOrders.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

async function requireOrder(teamId: number, id: number) {
  const order = await findOrder(teamId, id);
  if (!order) throw new SalesError('not_found');
  return order;
}

// ---------------------------------------------------------------------------
// Penawaran dan pesanan
// ---------------------------------------------------------------------------

export async function createOrder(actor: Actor, input: OrderInput): Promise<SalesOrder> {
  const { teamId, userId } = actor;
  await assertInputs(teamId, input);

  // Nomor urut per toko; indeks unik menolak dua permintaan bersamaan yang mendapat nomor sama, lalu diulang.
  let created: SalesOrder | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      const [[row]] = await withTenant(teamId, [
        db
          .insert(salesOrders)
          .values({
            teamId,
            number: sql`(select coalesce(max(number), 0) + 1 from sales_orders where team_id = ${teamId}::int)`,
            contactId: input.contactId,
            opportunityId: input.opportunityId,
            issueDate: input.issueDate,
            validUntil: input.validUntil,
            notes: input.notes,
            createdBy: userId,
          })
          .returning(),
      ]);
      created = row;
    } catch (e) {
      if (sqlState(e) !== '23505') throw e;
    }
  }
  if (!created) throw new SalesError('number_conflict');

  try {
    await withTenant(teamId, [
      db.insert(salesLines).values(lineRows(teamId, created.id, input.lines)),
      auditEntry(teamId, userId, 'SALES_ORDER_CREATED', {
        entityType: 'sales_order',
        entityId: created.id,
        metadata: { number: created.number },
      }),
    ]);
  } catch (e) {
    // Dokumen tanpa baris tidak boleh tersisa.
    await withTenant(teamId, [
      db.delete(salesOrders).where(and(eq(salesOrders.id, created.id), eq(salesOrders.teamId, teamId))),
    ]);
    throw e;
  }
  return created;
}

// Hanya penawaran (draft atau sent) yang bisa diubah; header dan semua baris diganti dalam satu transaksi.
export async function updateOrder(actor: Actor, id: number, input: OrderInput): Promise<SalesOrder> {
  const { teamId, userId } = actor;
  const existing = await requireOrder(teamId, id);
  if (!EDITABLE.includes(existing.status as OrderStatus)) throw new SalesError('invalid_status');
  await assertInputs(teamId, input);

  const results = await withTenant(teamId, [
    db
      .update(salesOrders)
      .set({
        contactId: input.contactId,
        opportunityId: input.opportunityId,
        issueDate: input.issueDate,
        validUntil: input.validUntil,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(salesOrders.id, id), eq(salesOrders.teamId, teamId), inArray(salesOrders.status, EDITABLE)))
      .returning(),
    db.delete(salesLines).where(and(eq(salesLines.orderId, id), eq(salesLines.teamId, teamId))),
    db.insert(salesLines).values(lineRows(teamId, id, input.lines)),
    auditEntry(teamId, userId, 'SALES_ORDER_UPDATED', {
      entityType: 'sales_order',
      entityId: id,
      metadata: { number: existing.number },
    }),
  ]);
  const updated = results[0][0];
  if (!updated) throw new SalesError('invalid_status');
  return updated;
}

async function transition(
  actor: Actor,
  id: number,
  from: OrderStatus[],
  to: OrderStatus,
  action: string,
  extra: Partial<typeof salesOrders.$inferInsert> = {},
  guard?: ReturnType<typeof sql>
): Promise<SalesOrder> {
  const { teamId, userId } = actor;
  const existing = await requireOrder(teamId, id);
  if (!from.includes(existing.status as OrderStatus)) throw new SalesError('invalid_status');

  const [rows] = await withTenant(teamId, [
    db
      .update(salesOrders)
      .set({ status: to, updatedAt: new Date(), ...extra })
      .where(and(eq(salesOrders.id, id), eq(salesOrders.teamId, teamId), inArray(salesOrders.status, from), guard))
      .returning(),
  ]);
  if (rows.length === 0) throw new SalesError(guard ? 'has_deliveries' : 'invalid_status');
  await withTenant(teamId, [
    auditEntry(teamId, userId, action, {
      entityType: 'sales_order',
      entityId: id,
      metadata: { number: existing.number },
    }),
  ]);
  return rows[0];
}

export const markSent = (a: Actor, id: number) => transition(a, id, ['draft'], 'sent', 'SALES_ORDER_SENT');
export const rejectOrder = (a: Actor, id: number) => transition(a, id, EDITABLE, 'rejected', 'SALES_ORDER_REJECTED');
export const confirmOrder = (a: Actor, id: number) =>
  transition(a, id, EDITABLE, 'confirmed', 'SALES_ORDER_CONFIRMED', { confirmedAt: new Date() });

// Pesanan yang sudah punya pengiriman tidak bisa dibatalkan: stok sudah keluar.
export const cancelOrder = (a: Actor, id: number) =>
  transition(
    a,
    id,
    ['confirmed'],
    'cancelled',
    'SALES_ORDER_CANCELLED',
    {},
    sql`not exists (select 1 from sales_deliveries d where d.order_id = sales_orders.id and d.team_id = sales_orders.team_id)`
  );

// ---------------------------------------------------------------------------
// Pengiriman
// ---------------------------------------------------------------------------

async function deliveredByLine(teamId: number, orderId: number): Promise<Map<number, number>> {
  const [rows] = await withTenant(teamId, [
    db
      .select({
        lineId: salesDeliveryLines.orderLineId,
        total: sql<number>`coalesce(sum(${salesDeliveryLines.quantity}), 0)::float8`,
      })
      .from(salesDeliveryLines)
      .innerJoin(
        salesLines,
        and(eq(salesLines.id, salesDeliveryLines.orderLineId), eq(salesLines.teamId, salesDeliveryLines.teamId))
      )
      .where(and(eq(salesLines.orderId, orderId), eq(salesLines.teamId, teamId)))
      .groupBy(salesDeliveryLines.orderLineId),
  ]);
  return new Map(rows.map((r) => [r.lineId, r.total]));
}

// Mencatat pengiriman (sebagian atau seluruhnya) dan mengurangi stok lewat Inventory. Stok dicek lebih
// dulu untuk semua baris; bila mutasi gagal di tengah (permintaan lain menghabiskan stok), pengiriman
// dibatalkan dan mutasi yang sudah tercatat dikembalikan dengan mutasi retur.
export async function createDelivery(actor: Actor, orderId: number, input: DeliveryInput): Promise<SalesDelivery> {
  const { teamId, userId } = actor;
  const order = await requireOrder(teamId, orderId);
  if (order.status !== 'confirmed') throw new SalesError('invalid_status');

  const [orderLines] = await withTenant(teamId, [
    db.select().from(salesLines).where(and(eq(salesLines.orderId, orderId), eq(salesLines.teamId, teamId))),
  ]);
  const byId = new Map(orderLines.map((l) => [l.id, l]));
  const delivered = await deliveredByLine(teamId, orderId);

  // Baris yang menggerakkan stok: berelasi varian bertipe stok (jasa dan baris bebas dilewati).
  const stocked = new Map<number, boolean>();
  const need = new Map<number, number>();
  for (const l of input.lines) {
    const line = byId.get(l.orderLineId);
    if (!line) throw new SalesError('invalid_line');
    if (l.quantity > round3(line.quantity - (delivered.get(line.id) ?? 0))) throw new SalesError('over_delivery');
    if (line.variantId !== null) {
      const ctx = await findVariant(teamId, line.variantId);
      const tracked = !!ctx?.product.trackStock;
      stocked.set(line.id, tracked);
      if (tracked) need.set(line.variantId, (need.get(line.variantId) ?? 0) + l.quantity);
    }
  }
  const levels = await getStockLevels(teamId, [...need.keys()]);
  for (const [variantId, qty] of need) {
    const available = levels.get(variantId) ?? 0;
    if (qty > available) {
      throw new SalesError('insufficient_stock', `Not enough stock: ${available} available, ${qty} requested`);
    }
  }

  const [[delivery]] = await withTenant(teamId, [
    db.insert(salesDeliveries).values({ teamId, orderId, note: input.note, createdBy: userId }).returning(),
  ]);

  const rollback = async (moved: { variantId: number; quantity: number }[]) => {
    for (const m of moved) {
      await recordMovement(actor, {
        variantId: m.variantId,
        quantity: m.quantity,
        kind: 'return',
        note: `Delivery cancelled (order ${order.number})`,
        reference: { type: 'sales_delivery', id: delivery.id },
      });
    }
    await withTenant(teamId, [
      db.delete(salesDeliveries).where(and(eq(salesDeliveries.id, delivery.id), eq(salesDeliveries.teamId, teamId))),
    ]);
  };

  // Kunci baris pesanan agar dua pengiriman bersamaan tidak saling menyisipkan; lalu hitung ulang.
  await withTenant(teamId, [
    db
      .select({ id: salesOrders.id })
      .from(salesOrders)
      .where(and(eq(salesOrders.id, orderId), eq(salesOrders.teamId, teamId)))
      .for('update'),
    db.insert(salesDeliveryLines).values(
      input.lines.map((l) => ({ teamId, deliveryId: delivery.id, orderLineId: l.orderLineId, quantity: l.quantity }))
    ),
  ]);
  const after = await deliveredByLine(teamId, orderId);
  if (input.lines.some((l) => (after.get(l.orderLineId) ?? 0) > byId.get(l.orderLineId)!.quantity + 1e-9)) {
    await rollback([]);
    throw new SalesError('over_delivery');
  }

  const moved: { variantId: number; quantity: number }[] = [];
  try {
    for (const l of input.lines) {
      const line = byId.get(l.orderLineId)!;
      if (!stocked.get(line.id)) continue;
      await recordMovement(actor, {
        variantId: line.variantId!,
        quantity: -l.quantity,
        kind: 'sale',
        note: `Delivery for order ${order.number}`,
        reference: { type: 'sales_delivery', id: delivery.id },
      });
      moved.push({ variantId: line.variantId!, quantity: l.quantity });
    }
  } catch (e) {
    await rollback(moved);
    if (e instanceof InventoryError && e.code === 'insufficient_stock') {
      throw new SalesError('insufficient_stock', e.message);
    }
    throw e;
  }

  await withTenant(teamId, [
    auditEntry(teamId, userId, 'SALES_DELIVERY_CREATED', {
      entityType: 'sales_order',
      entityId: orderId,
      metadata: { number: order.number, deliveryId: delivery.id },
    }),
  ]);
  return delivery;
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export type OrderListItem = SalesOrder & { contactName: string | null; total: number };

export async function listOrders(teamId: number, query: ListQuery) {
  const where = and(
    eq(salesOrders.teamId, teamId),
    query.status ? eq(salesOrders.status, query.status) : undefined,
    query.contactId ? eq(salesOrders.contactId, query.contactId) : undefined
  );
  const [rows, totals] = await withTenant(teamId, [
    db
      .select({
        order: salesOrders,
        total: sql<number>`coalesce((select sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2))
          from sales_lines l where l.order_id = sales_orders.id and l.team_id = sales_orders.team_id), 0)::float8`,
      })
      .from(salesOrders)
      .where(where)
      .orderBy(desc(salesOrders.number))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ n: count() }).from(salesOrders).where(where),
  ]);
  const names = await getContactNames(teamId, rows.map((r) => r.order.contactId));
  const items: OrderListItem[] = rows.map((r) => ({
    ...r.order,
    total: r.total,
    contactName: names.get(r.order.contactId)?.name ?? null,
  }));
  return { items, total: totals[0].n, page: query.page, pageSize: query.pageSize };
}

export async function getOrder(teamId: number, id: number) {
  const order = await findOrder(teamId, id);
  if (!order) return null;

  const [[lines, deliveries], names, delivered] = await Promise.all([
    withTenant(teamId, [
      db
        .select()
        .from(salesLines)
        .where(and(eq(salesLines.orderId, id), eq(salesLines.teamId, teamId)))
        .orderBy(asc(salesLines.position)),
      db
        .select()
        .from(salesDeliveries)
        .where(and(eq(salesDeliveries.orderId, id), eq(salesDeliveries.teamId, teamId)))
        .orderBy(desc(salesDeliveries.id)),
    ]),
    getContactNames(teamId, [order.contactId]),
    deliveredByLine(teamId, id),
  ]);
  const detailed = lines.map((l) => ({ ...l, total: lineTotal(l), delivered: delivered.get(l.id) ?? 0 }));
  return {
    ...order,
    contactName: names.get(order.contactId)?.name ?? null,
    lines: detailed,
    deliveries,
    total: round2(detailed.reduce((s, l) => s + l.total, 0)),
  };
}
