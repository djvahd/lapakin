import { describe, expect, it } from 'vitest';
import { listHref, parseDeliveryForm, parseListParams, parseOrderForm } from '@/modules/sales/form';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const header: [string, string][] = [
  ['contactId', '3'],
  ['issueDate', '2026-11-01'],
  ['validUntil', ''],
  ['notes', ''],
];

describe('parseOrderForm', () => {
  it('membaca baris sejajar, baris bebas bervarian kosong, dan melewati baris cadangan yang kosong', () => {
    const r = parseOrderForm(
      fd([
        ...header,
        ['variantId', '7'], ['description', 'Kopi'], ['quantity', '2'], ['unitPrice', '85000'], ['discountPct', '10'],
        ['variantId', ''], ['description', 'Ongkir'], ['quantity', '1'], ['unitPrice', '15000'], ['discountPct', ''],
        ['variantId', ''], ['description', ''], ['quantity', ''], ['unitPrice', ''], ['discountPct', ''],
      ])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.contactId).toBe(3);
    expect(r.data.validUntil).toBeNull();
    expect(r.data.lines).toEqual([
      { variantId: 7, description: 'Kopi', quantity: 2, unitPrice: 85000, discountPct: 10 },
      { variantId: null, description: 'Ongkir', quantity: 1, unitPrice: 15000, discountPct: 0 },
    ]);
  });

  it('menolak form tanpa baris terisi, tanpa pelanggan, atau dengan diskon berlebih', () => {
    const empty: [string, string][] = [['variantId', ''], ['description', ''], ['quantity', ''], ['unitPrice', ''], ['discountPct', '']];
    expect(parseOrderForm(fd([...header, ...empty])).ok).toBe(false);
    expect(parseOrderForm(fd([['issueDate', '2026-11-01'], ['variantId', ''], ['description', 'x'], ['quantity', '1'], ['unitPrice', '1'], ['discountPct', '']])).ok).toBe(false);
    expect(
      parseOrderForm(fd([...header, ['variantId', ''], ['description', 'x'], ['quantity', '1'], ['unitPrice', '1'], ['discountPct', '150']])).ok
    ).toBe(false);
  });
});

describe('parseDeliveryForm', () => {
  it('mengambil hanya baris dengan jumlah kirim lebih dari nol', () => {
    const r = parseDeliveryForm(fd([['orderId', '1'], ['qty-5', '2'], ['qty-6', ''], ['qty-7', '0'], ['note', 'Kurir A']]));
    expect(r).toEqual({ ok: true, data: { lines: [{ orderLineId: 5, quantity: 2 }], note: 'Kurir A' } });
  });

  it('menolak bila tidak ada yang dikirim', () => {
    expect(parseDeliveryForm(fd([['qty-5', '']])).ok).toBe(false);
  });
});

describe('parseListParams dan listHref', () => {
  it('mengabaikan status tak dikenal dan membentuk ulang tautan', () => {
    const q = parseListParams({ status: 'bogus', page: '2', contact: '4' });
    expect(q).toMatchObject({ status: undefined, page: 2, contactId: 4 });
    expect(listHref(q)).toBe('/dashboard/sales?contact=4&page=2');
    expect(listHref(parseListParams({ status: 'sent' }), { page: 1 })).toBe('/dashboard/sales?status=sent');
    expect(listHref(parseListParams({}))).toBe('/dashboard/sales');
  });
});
