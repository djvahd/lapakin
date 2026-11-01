import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { deliveryInputSchema, listQuerySchema, orderInputSchema } from '@/modules/sales/schemas';
import {
  SalesError,
  cancelOrder,
  confirmOrder,
  createDelivery,
  createOrder,
  getOrder,
  listOrders,
  markSent,
  rejectOrder,
  updateOrder,
  type Actor,
} from '@/modules/sales/service';
import { contacts } from '@/modules/contacts/schema';
import { createProduct, getProduct, getStockLevels, receiveStock } from '@/modules/inventory/service';
import { productInputSchema, stockInputSchema } from '@/modules/inventory/schemas';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `sales-test-${Date.now()}`;
let u1 = 0;
let A: Actor;
let B: Actor;
let contactA = 0;
let contactB = 0;

type L = Record<string, unknown>;
const line = (o: L = {}) => ({ description: 'Item', quantity: 1, unitPrice: 1000, ...o });
const order = (lines: L[] = [line()], o: L = {}) =>
  orderInputSchema.parse({ contactId: contactA, issueDate: '2026-11-01', lines, ...o });
const delivery = (lines: { orderLineId: number; quantity: number }[], note?: string) =>
  deliveryInputSchema.parse({ lines, note });
const level = async (actor: Actor, variantId: number) => (await getStockLevels(actor.teamId, [variantId])).get(variantId)!;
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(SalesError);
  expect((e as SalesError).code).toBe(code);
};
const stocked = async (name: string, quantity: number, trackStock = true) => {
  const p = await createProduct(A, productInputSchema.parse({ name, trackStock, salePrice: 5000 }));
  const v = (await getProduct(A.teamId, p.id))!.variants.find((x) => x.isDefault)!;
  if (quantity > 0) await receiveStock(A, stockInputSchema.parse({ variantId: v.id, quantity }));
  return v.id;
};
const confirmed = async (lines: L[], actor = A) => {
  const o = await createOrder(actor, order(lines));
  await confirmOrder(actor, o.id);
  return (await getOrder(actor.teamId, o.id))!;
};

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  const a = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const b = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  A = { teamId: a, userId: u1 };
  B = { teamId: b, userId: u1 };
  const [[ca]] = await withTenant(a, [db.insert(contacts).values({ teamId: a, kind: 'person', name: 'Budi' }).returning()]);
  const [[cb]] = await withTenant(b, [db.insert(contacts).values({ teamId: b, kind: 'person', name: 'Sari' }).returning()]);
  contactA = ca.id;
  contactB = cb.id;
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from sales_delivery_lines where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from sales_deliveries where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from sales_lines where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from sales_orders where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from inv_stock_movements where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from inv_variants where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from inv_products where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contacts where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${u1}`;
});

describe('validasi input', () => {
  it('menolak penawaran tanpa baris, diskon di atas 100, dan masa berlaku sebelum tanggal terbit', () => {
    expect(orderInputSchema.safeParse({ contactId: 1, issueDate: '2026-11-01', lines: [] }).success).toBe(false);
    expect(orderInputSchema.safeParse({ contactId: 1, issueDate: '2026-11-01', lines: [line({ discountPct: 101 })] }).success).toBe(false);
    expect(
      orderInputSchema.safeParse({ contactId: 1, issueDate: '2026-11-01', validUntil: '2026-10-01', lines: [line()] }).success
    ).toBe(false);
  });

  it('menolak baris pengiriman ganda', () => {
    expect(deliveryInputSchema.safeParse({ lines: [{ orderLineId: 1, quantity: 1 }, { orderLineId: 1, quantity: 2 }] }).success).toBe(false);
  });
});

describe('penawaran', () => {
  it('memberi nomor urut per toko, menghitung total dengan diskon, dan mencatat audit', async () => {
    const o1 = await createOrder(A, order([line({ quantity: 2, unitPrice: 10000, discountPct: 10 }), line({ quantity: 1, unitPrice: 500 })]));
    const o2 = await createOrder(A, order());
    const ob = await createOrder(B, order([line()], { contactId: contactB }));
    expect([o1.number, o2.number, ob.number]).toEqual([1, 2, 1]);
    expect(o1.status).toBe('draft');

    const detail = await getOrder(A.teamId, o1.id);
    expect(detail?.lines.map((l) => l.total)).toEqual([18000, 500]);
    expect(detail?.total).toBe(18500);
    expect(detail?.contactName).toBe('Budi');

    const [logs] = await withTenant(A.teamId, [
      db.select().from(activityLogs).where(and(eq(activityLogs.teamId, A.teamId), eq(activityLogs.entityId, o1.id), eq(activityLogs.entityType, 'sales_order'))),
    ]);
    expect(logs.map((l) => l.action)).toEqual(['SALES_ORDER_CREATED']);
  });

  it('menolak kontak toko lain, kontak yang tidak ada, dan varian toko lain', async () => {
    await expectCode(createOrder(A, order([line()], { contactId: contactB })), 'invalid_contact');
    const vB = await (async () => {
      const p = await createProduct(B, productInputSchema.parse({ name: 'Milik B' }));
      return (await getProduct(B.teamId, p.id))!.variants[0].id;
    })();
    await expectCode(createOrder(A, order([line({ variantId: vB })])), 'invalid_variant');
  });

  it('mengganti seluruh baris saat diubah, dan hanya selama draft atau sent', async () => {
    const o = await createOrder(A, order([line({ description: 'Lama' })]));
    await markSent(A, o.id);
    await updateOrder(A, o.id, order([line({ description: 'Baru 1' }), line({ description: 'Baru 2' })]));
    expect((await getOrder(A.teamId, o.id))?.lines.map((l) => l.description)).toEqual(['Baru 1', 'Baru 2']);

    await confirmOrder(A, o.id);
    await expectCode(updateOrder(A, o.id, order()), 'invalid_status');
  });

  it('mengikuti alur status dan menolak transisi yang tidak sah', async () => {
    const o = await createOrder(A, order());
    await expectCode(cancelOrder(A, o.id), 'invalid_status');
    await markSent(A, o.id);
    await expectCode(markSent(A, o.id), 'invalid_status');
    expect((await rejectOrder(A, o.id)).status).toBe('rejected');
    await expectCode(confirmOrder(A, o.id), 'invalid_status');

    const o2 = await createOrder(A, order());
    const c = await confirmOrder(A, o2.id);
    expect(c.status).toBe('confirmed');
    expect(c.confirmedAt).not.toBeNull();
    expect((await cancelOrder(A, o2.id)).status).toBe('cancelled');
  });

  it('tidak menampilkan atau mengubah pesanan toko lain', async () => {
    const o = await createOrder(A, order());
    expect(await getOrder(B.teamId, o.id)).toBeNull();
    await expectCode(confirmOrder(B, o.id), 'not_found');
    const listed = await listOrders(B.teamId, listQuerySchema.parse({}));
    expect(listed.items.every((i) => i.teamId === B.teamId)).toBe(true);
  });

  it('menyaring daftar menurut status dan menghitung total per pesanan', async () => {
    const o = await createOrder(A, order([line({ quantity: 3, unitPrice: 100 })]));
    await rejectOrder(A, o.id);
    const r = await listOrders(A.teamId, listQuerySchema.parse({ status: 'rejected' }));
    expect(r.items.every((i) => i.status === 'rejected')).toBe(true);
    expect(r.items.find((i) => i.id === o.id)).toMatchObject({ total: 300, contactName: 'Budi' });
  });
});

describe('pengiriman', () => {
  it('hanya untuk pesanan terkonfirmasi', async () => {
    const o = await createOrder(A, order());
    const d = await getOrder(A.teamId, o.id);
    await expectCode(createDelivery(A, o.id, delivery([{ orderLineId: d!.lines[0].id, quantity: 1 }])), 'invalid_status');
  });

  it('mengurangi stok sesuai jumlah kirim, mendukung kirim sebagian, dan menolak kelebihan kirim', async () => {
    const v = await stocked('Kopi', 10);
    const o = await confirmed([line({ variantId: v, quantity: 5 })]);
    const lineId = o.lines[0].id;

    await createDelivery(A, o.id, delivery([{ orderLineId: lineId, quantity: 2 }]));
    expect(await level(A, v)).toBe(8);
    expect((await getOrder(A.teamId, o.id))?.lines[0].delivered).toBe(2);

    await expectCode(createDelivery(A, o.id, delivery([{ orderLineId: lineId, quantity: 4 }])), 'over_delivery');
    expect(await level(A, v)).toBe(8);

    await createDelivery(A, o.id, delivery([{ orderLineId: lineId, quantity: 3 }]));
    expect(await level(A, v)).toBe(5);
    expect((await getOrder(A.teamId, o.id))?.deliveries).toHaveLength(2);
  });

  it('menolak pengiriman bila stok kurang, tanpa mengubah stok maupun menyisakan pengiriman', async () => {
    const v1 = await stocked('Gula', 10);
    const v2 = await stocked('Teh', 1);
    const o = await confirmed([line({ variantId: v1, quantity: 4 }), line({ variantId: v2, quantity: 3 })]);
    await expectCode(
      createDelivery(A, o.id, delivery(o.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })))),
      'insufficient_stock'
    );
    expect(await level(A, v1)).toBe(10);
    expect(await level(A, v2)).toBe(1);
    expect((await getOrder(A.teamId, o.id))?.deliveries).toHaveLength(0);
  });

  it('tidak menyentuh stok untuk jasa dan baris bebas', async () => {
    const svc = await stocked('Servis AC', 0, false);
    const o = await confirmed([line({ variantId: svc, quantity: 1 }), line({ description: 'Ongkir', quantity: 1 })]);
    await createDelivery(A, o.id, delivery(o.lines.map((l) => ({ orderLineId: l.id, quantity: 1 }))));
    expect((await getOrder(A.teamId, o.id))?.lines.every((l) => l.delivered === 1)).toBe(true);
  });

  it('menolak baris milik pesanan lain', async () => {
    const o1 = await confirmed([line()]);
    const o2 = await confirmed([line()]);
    await expectCode(createDelivery(A, o1.id, delivery([{ orderLineId: o2.lines[0].id, quantity: 1 }])), 'invalid_line');
  });

  it('pesanan yang sudah punya pengiriman tidak bisa dibatalkan', async () => {
    const o = await confirmed([line()]);
    await createDelivery(A, o.id, delivery([{ orderLineId: o.lines[0].id, quantity: 1 }]));
    await expectCode(cancelOrder(A, o.id), 'has_deliveries');
  });

  it('dua pengiriman bersamaan tidak membuat stok minus maupun kelebihan kirim', async () => {
    const v = await stocked('Madu', 5);
    const o = await confirmed([line({ variantId: v, quantity: 5 })]);
    const lineId = o.lines[0].id;
    const results = await Promise.allSettled([
      createDelivery(A, o.id, delivery([{ orderLineId: lineId, quantity: 4 }])),
      createDelivery(A, o.id, delivery([{ orderLineId: lineId, quantity: 4 }])),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled').length).toBeLessThanOrEqual(1);
    const detail = await getOrder(A.teamId, o.id);
    expect(detail!.lines[0].delivered).toBeLessThanOrEqual(5);
    expect(await level(A, v)).toBe(5 - detail!.lines[0].delivered);
  });
});
