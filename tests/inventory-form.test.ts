import { describe, expect, it } from 'vitest';
import { listHref, parseAdjustForm, parseListParams, parseProductForm, parseStockForm, parseVariantForm } from '@/modules/inventory/form';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('parseProductForm', () => {
  it('kolom kosong memakai nilai bawaan, dan checkbox mati berarti tanpa pelacakan stok', () => {
    const r = parseProductForm(fd({ name: 'Kopi', unit: '', sku: '', salePrice: '', costPrice: '', reorderLevel: '' }));
    expect(r).toEqual({
      ok: true,
      data: { name: 'Kopi', description: null, unit: 'pcs', sku: null, salePrice: 0, costPrice: 0, trackStock: false, reorderLevel: null },
    });
  });

  it('membaca harga, batas stok, dan checkbox aktif', () => {
    const r = parseProductForm(fd({ name: 'Kopi', salePrice: '85000.5', reorderLevel: '5', trackStock: 'on' }));
    expect(r).toMatchObject({ ok: true, data: { salePrice: 85000.5, reorderLevel: 5, trackStock: true } });
  });

  it('menolak nama kosong, harga negatif, dan teks bukan angka', () => {
    expect(parseProductForm(fd({ name: ' ' })).ok).toBe(false);
    expect(parseProductForm(fd({ name: 'A', salePrice: '-1' })).ok).toBe(false);
    expect(parseProductForm(fd({ name: 'A', salePrice: 'mahal' })).ok).toBe(false);
  });
});

describe('parseVariantForm', () => {
  it('harga kosong menjadi null (ikut harga produk)', () => {
    expect(parseVariantForm(fd({ name: 'XL', sku: '', salePrice: '', costPrice: '' }))).toEqual({
      ok: true,
      data: { name: 'XL', sku: null, salePrice: null, costPrice: null },
    });
    expect(parseVariantForm(fd({ name: '' })).ok).toBe(false);
  });
});

describe('parseStockForm dan parseAdjustForm', () => {
  it('jumlah wajib positif untuk terima dan keluar', () => {
    expect(parseStockForm(fd({ variantId: '3', quantity: '2.5', note: ' dus ' }))).toMatchObject({ ok: true, data: { variantId: 3, quantity: 2.5, note: 'dus' } });
    for (const quantity of ['', '0', '-1', 'x']) expect(parseStockForm(fd({ variantId: '3', quantity })).ok).toBe(false);
    expect(parseStockForm(fd({ quantity: '1' })).ok).toBe(false);
  });

  it('hasil hitung boleh nol tetapi tidak boleh kosong atau negatif', () => {
    expect(parseAdjustForm(fd({ variantId: '3', countedQuantity: '0' }))).toMatchObject({ ok: true, data: { countedQuantity: 0 } });
    expect(parseAdjustForm(fd({ variantId: '3', countedQuantity: '' })).ok).toBe(false);
    expect(parseAdjustForm(fd({ variantId: '3', countedQuantity: '-2' })).ok).toBe(false);
  });
});

describe('query daftar', () => {
  it('membaca filter dan mengabaikan nilai tidak valid', () => {
    expect(parseListParams({ q: ' kopi ', low: '1', archived: '1', page: '3' })).toMatchObject({ q: 'kopi', lowStock: true, archived: true, page: 3 });
    expect(parseListParams({ page: 'abc', low: 'x' })).toMatchObject({ page: 1, lowStock: false, archived: false });
  });

  it('tautan hanya menulis nilai non-bawaan', () => {
    const q = parseListParams({});
    expect(listHref(q)).toBe('/dashboard/inventory');
    expect(listHref(q, { q: 'a b', lowStock: true, page: 2 })).toBe('/dashboard/inventory?q=a+b&low=1&page=2');
  });
});
