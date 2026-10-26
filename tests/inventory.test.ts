import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { invProducts, invStockMovements, invVariants } from '@/modules/inventory/schema';
import {
  adjustInputSchema,
  listQuerySchema,
  movementQuerySchema,
  productInputSchema,
  stockInputSchema,
  variantInputSchema,
} from '@/modules/inventory/schemas';
import {
  InventoryError,
  addVariant,
  adjustStock,
  archiveProduct,
  archiveVariant,
  createProduct,
  getProduct,
  getStockLevels,
  issueStock,
  listMovements,
  listProducts,
  receiveStock,
  recordMovement,
  restoreProduct,
  restoreVariant,
  updateProduct,
  updateVariant,
  type Actor,
} from '@/modules/inventory/service';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `inv-test-${Date.now()}`;
let u1 = 0;
let A: Actor;
let B: Actor;

const prod = (name: string, o: Record<string, unknown> = {}) => productInputSchema.parse({ name, ...o });
const variant = (name: string, o: Record<string, unknown> = {}) => variantInputSchema.parse({ name, ...o });
const stock = (variantId: number, quantity: number, note?: string) => stockInputSchema.parse({ variantId, quantity, note });
const list = (teamId: number, q: Record<string, unknown> = {}) => listProducts(teamId, listQuerySchema.parse(q));
const names = (r: { items: { name: string }[] }) => r.items.map((i) => i.name);
const level = async (actor: Actor, variantId: number) => (await getStockLevels(actor.teamId, [variantId])).get(variantId);
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(InventoryError);
  expect((e as InventoryError).code).toBe(code);
  return e as InventoryError;
};
const defaultVariantOf = async (actor: Actor, productId: number) =>
  (await getProduct(actor.teamId, productId))!.variants.find((v) => v.isDefault)!;
const newStocked = async (actor: Actor, name: string, quantity = 0) => {
  const p = await createProduct(actor, prod(name));
  const v = await defaultVariantOf(actor, p.id);
  if (quantity > 0) await receiveStock(actor, stock(v.id, quantity));
  return { p, v };
};
const auditOf = async (teamId: number, productId: number) => {
  const [rows] = await withTenant(teamId, [
    db
      .select({ action: activityLogs.action, metadata: activityLogs.metadata })
      .from(activityLogs)
      .where(and(eq(activityLogs.teamId, teamId), eq(activityLogs.entityId, productId), eq(activityLogs.entityType, 'inv_product'))),
  ]);
  return rows;
};

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  const a = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const b = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  A = { teamId: a, userId: u1 };
  B = { teamId: b, userId: u1 };
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from inv_stock_movements where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from inv_variants where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from inv_products where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${u1}`;
});

describe('produk dan varian bawaan', () => {
  it('membuat produk dengan tepat satu varian bawaan tanpa nama, dan mencatat audit', async () => {
    const p = await createProduct(A, prod('Kopi Arabika 250g', { sku: 'KOPI-250', salePrice: 85000, costPrice: 50000, unit: 'bks', reorderLevel: 5 }));
    const detail = await getProduct(A.teamId, p.id);
    expect(detail).toMatchObject({ name: 'Kopi Arabika 250g', unit: 'bks', salePrice: 85000, costPrice: 50000, reorderLevel: 5, stock: 0 });
    expect(detail?.variants).toHaveLength(1);
    expect(detail?.variants[0]).toMatchObject({ isDefault: true, name: null, sku: 'KOPI-250', stock: 0, effectiveSalePrice: 85000 });
    expect((await auditOf(A.teamId, p.id)).map((l) => l.action)).toContain('INVENTORY_PRODUCT_CREATED');
  });

  it('SKU unik per toko tanpa membedakan huruf besar kecil, dan kegagalan tidak meninggalkan produk', async () => {
    await createProduct(A, prod('Teh Hijau', { sku: 'TEH-1' }));
    const before = (await list(A.teamId, { pageSize: 100 })).total;
    await expectCode(createProduct(A, prod('Teh Hitam', { sku: 'teh-1' })), 'sku_exists');
    expect((await list(A.teamId, { pageSize: 100 })).total).toBe(before);

    await expect(createProduct(B, prod('Teh di Toko B', { sku: 'TEH-1' }))).resolves.toMatchObject({ name: 'Teh di Toko B' });
    await createProduct(A, prod('Tanpa SKU 1'));
    await expect(createProduct(A, prod('Tanpa SKU 2'))).resolves.toMatchObject({ name: 'Tanpa SKU 2' });
  });

  it('mengubah produk beserta SKU bawaan dalam satu transaksi; SKU bentrok membatalkan semuanya', async () => {
    const p = await createProduct(A, prod('Gula Pasir', { sku: 'GULA-1' }));
    await createProduct(A, prod('Garam', { sku: 'GARAM-1' }));

    const updated = await updateProduct(A, p.id, prod('Gula Pasir Premium', { sku: 'GULA-2', salePrice: 16000 }));
    expect(updated).toMatchObject({ name: 'Gula Pasir Premium', salePrice: 16000 });
    expect((await defaultVariantOf(A, p.id)).sku).toBe('GULA-2');

    await expectCode(updateProduct(A, p.id, prod('Nama Baru Lagi', { sku: 'garam-1' })), 'sku_exists');
    const after = await getProduct(A.teamId, p.id);
    expect(after?.name).toBe('Gula Pasir Premium');
    expect(after?.variants[0].sku).toBe('GULA-2');
  });

  it('produk toko lain tidak bisa dilihat, diubah, atau diarsipkan', async () => {
    const p = await createProduct(A, prod('Rahasia A'));
    expect(await getProduct(B.teamId, p.id)).toBeNull();
    await expectCode(updateProduct(B, p.id, prod('Dibajak')), 'not_found');
    await expectCode(archiveProduct(B, p.id), 'not_found');
    expect((await list(B.teamId, { q: 'Rahasia' })).total).toBe(0);
  });

  it('varian tambahan: harga menimpa harga produk, SKU unik, dan varian bawaan tidak bisa diarsipkan', async () => {
    const p = await createProduct(A, prod('Kaos Polos', { salePrice: 100000, costPrice: 60000 }));
    const merah = await addVariant(A, p.id, variant('Merah / L', { sku: 'KAOS-M-L', salePrice: 110000 }));
    expect(merah).toMatchObject({ name: 'Merah / L', salePrice: 110000, costPrice: null, isDefault: false });

    const detail = await getProduct(A.teamId, p.id);
    const row = detail!.variants.find((v) => v.id === merah.id)!;
    expect(row.effectiveSalePrice).toBe(110000);
    expect(row.effectiveCostPrice).toBe(60000);
    expect(detail!.variants[0].isDefault).toBe(true);

    await expectCode(addVariant(A, p.id, variant('Biru / L', { sku: 'kaos-m-l' })), 'sku_exists');
    const def = detail!.variants.find((v) => v.isDefault)!;
    await expectCode(archiveVariant(A, def.id), 'default_variant');

    const updated = await updateVariant(A, def.id, variant('Diabaikan', { sku: 'KAOS-DEF' }));
    expect(updated).toMatchObject({ name: null, sku: 'KAOS-DEF', isDefault: true });

    await archiveVariant(A, merah.id);
    expect((await getProduct(A.teamId, p.id))!.variants.find((v) => v.id === merah.id)?.archivedAt).not.toBeNull();
    await expectCode(receiveStock(A, stock(merah.id, 1)), 'archived');
    await restoreVariant(A, merah.id);
    await expect(receiveStock(A, stock(merah.id, 1))).resolves.toMatchObject({ quantity: 1 });
  });

  it('produk terarsip tidak bisa diubah, ditambah varian, atau dimutasi, dan hilang dari daftar bawaan', async () => {
    const { p, v } = await newStocked(A, 'Akan Diarsipkan', 3);
    await archiveProduct(A, p.id);
    await archiveProduct(A, p.id);
    await expectCode(updateProduct(A, p.id, prod('Edit')), 'archived');
    await expectCode(addVariant(A, p.id, variant('V')), 'archived');
    await expectCode(receiveStock(A, stock(v.id, 1)), 'archived');
    expect(names(await list(A.teamId, { q: 'Akan Diarsipkan' }))).toEqual([]);
    expect(names(await list(A.teamId, { q: 'Akan Diarsipkan', archived: true }))).toEqual(['Akan Diarsipkan']);

    await restoreProduct(A, p.id);
    expect(names(await list(A.teamId, { q: 'Akan Diarsipkan' }))).toEqual(['Akan Diarsipkan']);
    expect(await level(A, v.id)).toBe(3);
    const actions = (await auditOf(A.teamId, p.id)).map((l) => l.action);
    expect(actions.filter((a) => a === 'INVENTORY_PRODUCT_ARCHIVED')).toHaveLength(1);
  });
});

describe('batasan database', () => {
  it('menolak dua varian bawaan, harga negatif, dan rujukan produk lintas toko', async () => {
    const p = await createProduct(A, prod('Batasan DB'));
    await expect(
      owner`insert into inv_variants (team_id, product_id, is_default) values (${A.teamId}, ${p.id}, true)`
    ).rejects.toThrow(/unique/i);
    await expect(
      owner`insert into inv_products (team_id, name, sale_price) values (${A.teamId}, 'Negatif', -1)`
    ).rejects.toThrow(/check/i);
    await expect(
      owner`insert into inv_variants (team_id, product_id, name) values (${B.teamId}, ${p.id}, 'Penyusup')`
    ).rejects.toThrow(/foreign key/i);
  });

  it('menolak mutasi bertanda salah, nol, jenis tak dikenal, dan varian toko lain', async () => {
    const { v } = await newStocked(A, 'Mutasi DB', 5);
    const ins = (kind: string, q: number, team = A.teamId) =>
      owner`insert into inv_stock_movements (team_id, variant_id, quantity, kind) values (${team}, ${v.id}, ${q}, ${kind})`;
    await expect(ins('receipt', -1)).rejects.toThrow(/check/i);
    await expect(ins('issue', 1)).rejects.toThrow(/check/i);
    await expect(ins('sale', 2)).rejects.toThrow(/check/i);
    await expect(ins('return', -2)).rejects.toThrow(/check/i);
    await expect(ins('adjustment', 0)).rejects.toThrow(/check/i);
    await expect(ins('transfer', 1)).rejects.toThrow(/check/i);
    await expect(ins('receipt', 1, B.teamId)).rejects.toThrow(/foreign key/i);
    await expect(ins('adjustment', -1)).resolves.toBeDefined();
  });

  it('tabel inventori tanpa konteks tenant kosong (RLS)', async () => {
    expect(await db.select().from(invProducts)).toEqual([]);
    expect(await db.select().from(invVariants)).toEqual([]);
    expect(await db.select().from(invStockMovements)).toEqual([]);
  });

  it('buku besar hanya bertambah: lapakin_app tidak bisa mengubah atau menghapus mutasi', async () => {
    const { v } = await newStocked(A, 'Buku Besar', 4);
    await expect(
      withTenant(A.teamId, [db.update(invStockMovements).set({ quantity: 999 }).where(eq(invStockMovements.variantId, v.id))])
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withTenant(A.teamId, [db.delete(invStockMovements).where(eq(invStockMovements.variantId, v.id))])
    ).rejects.toThrow(/permission denied/i);
    expect(await level(A, v.id)).toBe(4);
  });
});

describe('mutasi stok', () => {
  it('terima dan keluarkan menghitung stok dari mutasi, termasuk desimal', async () => {
    const { v } = await newStocked(A, 'Beras Curah');
    await receiveStock(A, stock(v.id, 10, 'dari gudang'));
    await issueStock(A, stock(v.id, 4));
    expect(await level(A, v.id)).toBe(6);

    await receiveStock(A, stock(v.id, 2.5));
    await issueStock(A, stock(v.id, 0.75));
    expect(await level(A, v.id)).toBe(7.75);
  });

  it('pengeluaran melebihi stok ditolak dengan pesan yang menyebut sisa, dan tidak mencatat apa pun', async () => {
    const { v } = await newStocked(A, 'Stok Terbatas', 6);
    const err = await expectCode(issueStock(A, stock(v.id, 7)), 'insufficient_stock');
    expect(err.message).toBe('Not enough stock: 6 available, 7 requested');
    expect(await level(A, v.id)).toBe(6);

    await expect(issueStock(A, stock(v.id, 6))).resolves.toMatchObject({ quantity: -6 });
    expect(await level(A, v.id)).toBe(0);
    await expectCode(issueStock(A, stock(v.id, 0.001)), 'insufficient_stock');
  });

  it('menolak jasa (tanpa stok), varian toko lain, dan tanda yang tidak sesuai jenis', async () => {
    const service = await createProduct(A, prod('Jasa Pasang', { trackStock: false }));
    const sv = await defaultVariantOf(A, service.id);
    await expectCode(receiveStock(A, stock(sv.id, 1)), 'not_tracked');

    const { v } = await newStocked(A, 'Barang A', 2);
    await expectCode(receiveStock(B, stock(v.id, 5)), 'variant_not_found');
    expect(await level(A, v.id)).toBe(2);

    await expectCode(recordMovement(A, { variantId: v.id, quantity: -1, kind: 'receipt' }), 'invalid_movement');
    await expectCode(recordMovement(A, { variantId: v.id, quantity: 1, kind: 'sale' }), 'invalid_movement');
    await expectCode(recordMovement(A, { variantId: v.id, quantity: 0, kind: 'adjustment' }), 'invalid_movement');
    await expectCode(recordMovement(A, { variantId: v.id, quantity: Number.NaN, kind: 'receipt' }), 'invalid_movement');
  });

  it('fungsi publik untuk modul lain: sale dan return membawa referensi dokumen', async () => {
    const { v } = await newStocked(A, 'Dijual Lewat Sales', 10);
    const sale = await recordMovement(A, { variantId: v.id, quantity: -3, kind: 'sale', note: 'SO-12', reference: { type: 'sale_order', id: 12 } });
    expect(sale).toMatchObject({ kind: 'sale', quantity: -3, referenceType: 'sale_order', referenceId: 12, note: 'SO-12' });
    await recordMovement(A, { variantId: v.id, quantity: 1, kind: 'return', reference: { type: 'sale_order', id: 12 } });
    expect(await level(A, v.id)).toBe(8);
    await expectCode(recordMovement(A, { variantId: v.id, quantity: -9, kind: 'sale' }), 'insufficient_stock');
  });

  it('koreksi hasil hitung membuat mutasi selisih, atau tidak ada bila sama', async () => {
    const { p, v } = await newStocked(A, 'Hitung Fisik', 10);

    const up = await adjustStock(A, adjustInputSchema.parse({ variantId: v.id, countedQuantity: 14, note: 'ketemu di rak' }));
    expect(up.delta).toBe(4);
    expect(up.movement).toMatchObject({ kind: 'adjustment', quantity: 4, note: 'ketemu di rak' });
    expect(await level(A, v.id)).toBe(14);

    const none = await adjustStock(A, adjustInputSchema.parse({ variantId: v.id, countedQuantity: 14 }));
    expect(none).toEqual({ movement: null, delta: 0 });

    const down = await adjustStock(A, adjustInputSchema.parse({ variantId: v.id, countedQuantity: 3.5 }));
    expect(down.delta).toBe(-10.5);
    expect(await level(A, v.id)).toBe(3.5);

    const zero = await adjustStock(A, adjustInputSchema.parse({ variantId: v.id, countedQuantity: 0 }));
    expect(zero.delta).toBe(-3.5);

    const adjustments = (await auditOf(A.teamId, p.id)).filter((l) => l.action === 'INVENTORY_STOCK_ADJUSTMENT');
    expect(adjustments).toHaveLength(3);
  });

  it('audit menyebut nama produk dan varian, dan mutasi masuk dan keluar tercatat', async () => {
    const p = await createProduct(A, prod('Audit Stok'));
    const kecil = await addVariant(A, p.id, variant('Kecil'));
    await receiveStock(A, stock(kecil.id, 5));
    await issueStock(A, stock(kecil.id, 2));
    const rows = await auditOf(A.teamId, p.id);
    expect(rows.find((r) => r.action === 'INVENTORY_STOCK_RECEIPT')?.metadata).toMatchObject({ name: 'Audit Stok (Kecil)', quantity: 5 });
    expect(rows.find((r) => r.action === 'INVENTORY_STOCK_ISSUE')?.metadata).toMatchObject({ name: 'Audit Stok (Kecil)', quantity: -2 });
  });

  it('stok toko lain tidak bocor lewat fungsi publik', async () => {
    const { v } = await newStocked(A, 'Hanya Toko A', 9);
    expect((await getStockLevels(B.teamId, [v.id])).get(v.id)).toBe(0);
    expect(await listMovements(B.teamId, movementQuerySchema.parse({ variantId: v.id }))).toMatchObject({ total: 0, items: [] });
  });
});

describe('konkurensi: stok tidak pernah minus', () => {
  it('10 pengeluaran serentak untuk stok 6 menghasilkan tepat 6 yang berhasil dan stok akhir 0', async () => {
    const { v } = await newStocked(A, 'Rebutan', 6);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => issueStock(A, stock(v.id, 1))));

    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(6);
    expect(failed).toHaveLength(4);
    expect(failed.every((f) => f.reason instanceof InventoryError && f.reason.code === 'insufficient_stock')).toBe(true);
    expect(await level(A, v.id)).toBe(0);

    // Invarian: jumlah berjalan menurut urutan mutasi tidak pernah di bawah nol.
    const rows = await owner`select quantity::float8 q from inv_stock_movements where variant_id = ${v.id} order by id`;
    let running = 0;
    for (const r of rows) {
      running += r.q;
      expect(running).toBeGreaterThanOrEqual(0);
    }
  });

  it('pengeluaran berbeda ukuran yang bersaing tidak pernah melampaui stok', async () => {
    const { v } = await newStocked(A, 'Rebutan Ukuran', 10);
    const sizes = [4, 4, 4, 3, 3, 2, 2, 1];
    const results = await Promise.allSettled(sizes.map((n) => issueStock(A, stock(v.id, n))));
    const taken = results.reduce((sum, r, i) => (r.status === 'fulfilled' ? sum + sizes[i] : sum), 0);
    const left = (await level(A, v.id))!;
    expect(taken).toBeLessThanOrEqual(10);
    expect(left).toBe(10 - taken);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('pengeluaran, penerimaan, dan koreksi bersamaan menghasilkan stok yang konsisten dengan mutasinya', async () => {
    const { v } = await newStocked(A, 'Campur Aduk', 5);
    await Promise.allSettled([
      issueStock(A, stock(v.id, 2)),
      issueStock(A, stock(v.id, 2)),
      receiveStock(A, stock(v.id, 3)),
      issueStock(A, stock(v.id, 4)),
      adjustStock(A, adjustInputSchema.parse({ variantId: v.id, countedQuantity: 20 })),
      issueStock(A, stock(v.id, 1)),
    ]);
    const rows = await owner`select quantity::float8 q from inv_stock_movements where variant_id = ${v.id} order by id`;
    let running = 0;
    for (const r of rows) {
      running += r.q;
      expect(running).toBeGreaterThanOrEqual(0);
    }
    expect(await level(A, v.id)).toBeCloseTo(running, 3);
  });
});

describe('daftar, stok menipis, dan riwayat', () => {
  beforeAll(async () => {
    const one = await createProduct(A, prod('Lis Satu', { sku: 'LIS-1', reorderLevel: 5 }));
    const two = await createProduct(A, prod('Lis Dua', { sku: 'LIS-2', reorderLevel: 5 }));
    const three = await createProduct(A, prod('Lis Tiga', { sku: 'LIS-3' }));
    const svc = await createProduct(A, prod('Lis Jasa', { trackStock: false, reorderLevel: 5 }));
    const v1 = await defaultVariantOf(A, one.id);
    const v2 = await defaultVariantOf(A, two.id);
    const v2b = await addVariant(A, two.id, variant('Besar'));
    await receiveStock(A, stock(v1.id, 3));
    await receiveStock(A, stock(v2.id, 4));
    await receiveStock(A, stock(v2b.id, 4));
    await receiveStock(A, stock((await defaultVariantOf(A, three.id)).id, 1));
    void svc;
  });

  it('total stok menjumlahkan semua varian, dan penanda menipis mengikuti batas produk', async () => {
    const r = await list(A.teamId, { q: 'Lis ', pageSize: 50 });
    const byName = Object.fromEntries(r.items.map((i) => [i.name, i]));
    expect(byName['Lis Satu']).toMatchObject({ stock: 3, low: true, variantCount: 1, sku: 'LIS-1' });
    expect(byName['Lis Dua']).toMatchObject({ stock: 8, low: false, variantCount: 2 });
    expect(byName['Lis Tiga']).toMatchObject({ stock: 1, low: false });
    expect(byName['Lis Jasa']).toMatchObject({ stock: 0, low: false });
  });

  it('filter stok menipis hanya mengembalikan produk yang dilacak dan berbatas', async () => {
    const r = await list(A.teamId, { q: 'Lis ', lowStock: true });
    expect(names(r)).toEqual(['Lis Satu']);
    expect(r.total).toBe(1);
  });

  it('mencari menurut nama dan SKU tanpa membedakan huruf besar, dengan wildcard sebagai teks biasa', async () => {
    expect(names(await list(A.teamId, { q: 'lis-2' }))).toEqual(['Lis Dua']);
    expect(names(await list(A.teamId, { q: 'LIS DUA' }))).toEqual(['Lis Dua']);
    expect(names(await list(A.teamId, { q: '%' }))).toEqual([]);
  });

  it('paginasi dan toko lain tidak melihat produk toko A', async () => {
    const p1 = await list(A.teamId, { q: 'Lis ', pageSize: 2, page: 1 });
    const p2 = await list(A.teamId, { q: 'Lis ', pageSize: 2, page: 2 });
    expect(p1.total).toBe(4);
    expect(p1.pageCount).toBe(2);
    expect([...names(p1), ...names(p2)]).toEqual(['Lis Dua', 'Lis Jasa', 'Lis Satu', 'Lis Tiga']);
    expect((await list(B.teamId, { q: 'Lis ' })).total).toBe(0);
  });

  it('riwayat mutasi: terbaru dulu, nama produk dan varian, pembuat, dan filter', async () => {
    const two = (await list(A.teamId, { q: 'Lis Dua' })).items[0];
    const detail = (await getProduct(A.teamId, two.id))!;
    const big = detail.variants.find((x) => x.name === 'Besar')!;

    const all = await listMovements(A.teamId, movementQuerySchema.parse({ productId: two.id }));
    expect(all.total).toBe(2);
    expect(all.items[0]).toMatchObject({ productName: 'Lis Dua', variantName: 'Besar', quantity: 4, kind: 'receipt' });
    expect(all.items[0].userName).toEqual(expect.any(String));

    const onlyBig = await listMovements(A.teamId, movementQuerySchema.parse({ variantId: big.id }));
    expect(onlyBig.items.map((m) => m.variantName)).toEqual(['Besar']);

    const paged = await listMovements(A.teamId, movementQuerySchema.parse({ productId: two.id, pageSize: 1, page: 2 }));
    expect(paged.items).toHaveLength(1);
    expect(paged.pageCount).toBe(2);
  });
});
