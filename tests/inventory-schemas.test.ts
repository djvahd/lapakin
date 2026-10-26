import { describe, expect, it } from 'vitest';
import {
  adjustInputSchema,
  listQuerySchema,
  movementQuerySchema,
  productInputSchema,
  stockInputSchema,
  variantInputSchema,
} from '@/modules/inventory/schemas';

describe('productInputSchema', () => {
  it('menerima input minimal dan memberi nilai bawaan', () => {
    expect(productInputSchema.parse({ name: '  Kopi Arabika  ' })).toEqual({
      name: 'Kopi Arabika',
      description: null,
      unit: 'pcs',
      sku: null,
      salePrice: 0,
      costPrice: 0,
      trackStock: true,
      reorderLevel: null,
    });
  });

  it('menolak nama kosong dan satuan kosong, dan membatasi panjang', () => {
    expect(productInputSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: 'A', unit: ' ' }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: 'x'.repeat(201) }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: 'A', unit: 'x'.repeat(21) }).success).toBe(false);
  });

  it('harga dibulatkan 2 desimal dan tidak boleh negatif atau melewati batas', () => {
    expect(productInputSchema.parse({ name: 'A', salePrice: 1234.567, costPrice: 0.1 + 0.2 })).toMatchObject({
      salePrice: 1234.57,
      costPrice: 0.3,
    });
    expect(productInputSchema.safeParse({ name: 'A', salePrice: -1 }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: 'A', costPrice: 1e13 }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: 'A', salePrice: 'mahal' }).success).toBe(false);
  });

  it('SKU: kosong menjadi null, tidak boleh mengandung spasi, dan dibatasi 64 karakter', () => {
    expect(productInputSchema.parse({ name: 'A', sku: '' }).sku).toBeNull();
    expect(productInputSchema.parse({ name: 'A', sku: ' KOPI-01 ' }).sku).toBe('KOPI-01');
    expect(productInputSchema.safeParse({ name: 'A', sku: 'KOPI 01' }).success).toBe(false);
    expect(productInputSchema.safeParse({ name: 'A', sku: 'x'.repeat(65) }).success).toBe(false);
  });

  it('batas stok menipis: null berarti tidak dipantau, 0 boleh, negatif ditolak, dibulatkan 3 desimal', () => {
    expect(productInputSchema.parse({ name: 'A', reorderLevel: null }).reorderLevel).toBeNull();
    expect(productInputSchema.parse({ name: 'A', reorderLevel: 0 }).reorderLevel).toBe(0);
    expect(productInputSchema.parse({ name: 'A', reorderLevel: 2.5004 }).reorderLevel).toBe(2.5);
    expect(productInputSchema.safeParse({ name: 'A', reorderLevel: -1 }).success).toBe(false);
  });
});

describe('variantInputSchema', () => {
  it('butuh nama; harga kosong berarti memakai harga produk', () => {
    expect(variantInputSchema.parse({ name: ' Merah / L ' })).toEqual({ name: 'Merah / L', sku: null, salePrice: null, costPrice: null });
    expect(variantInputSchema.parse({ name: 'XL', salePrice: 55000.555, costPrice: 0 })).toMatchObject({ salePrice: 55000.56, costPrice: 0 });
    expect(variantInputSchema.safeParse({ name: '  ' }).success).toBe(false);
    expect(variantInputSchema.safeParse({ name: 'XL', salePrice: -5 }).success).toBe(false);
  });
});

describe('jumlah stok', () => {
  it('stockInputSchema: harus lebih dari nol, dibulatkan 3 desimal, dan angka', () => {
    expect(stockInputSchema.parse({ variantId: 3, quantity: 2.5, note: ' dus ' })).toEqual({ variantId: 3, quantity: 2.5, note: 'dus' });
    expect(stockInputSchema.parse({ variantId: 3, quantity: 1.23456 }).quantity).toBe(1.235);
    for (const bad of [0, -1, 0.0004, Number.NaN, 2e9, 'banyak']) {
      expect(stockInputSchema.safeParse({ variantId: 3, quantity: bad }).success).toBe(false);
    }
    expect(stockInputSchema.safeParse({ variantId: 0, quantity: 1 }).success).toBe(false);
  });

  it('adjustInputSchema: hasil hitung boleh 0 tetapi tidak negatif', () => {
    expect(adjustInputSchema.parse({ variantId: 3, countedQuantity: 0 }).countedQuantity).toBe(0);
    expect(adjustInputSchema.parse({ variantId: 3, countedQuantity: 12.3456 }).countedQuantity).toBe(12.346);
    expect(adjustInputSchema.safeParse({ variantId: 3, countedQuantity: -1 }).success).toBe(false);
    expect(adjustInputSchema.safeParse({ variantId: 3, countedQuantity: 'x' }).success).toBe(false);
  });

  it('catatan dibatasi 500 karakter', () => {
    expect(stockInputSchema.safeParse({ variantId: 1, quantity: 1, note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('query', () => {
  it('daftar dan riwayat memberi nilai bawaan dan membatasi ukuran halaman', () => {
    expect(listQuerySchema.parse({})).toEqual({ lowStock: false, archived: false, page: 1, pageSize: 20 });
    expect(listQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(movementQuerySchema.parse({})).toEqual({ page: 1, pageSize: 30 });
    expect(movementQuerySchema.safeParse({ variantId: 0 }).success).toBe(false);
  });
});
