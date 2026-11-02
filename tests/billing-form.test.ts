import { describe, expect, it } from 'vitest';
import { listHref, parseInvoiceForm, parseListParams, parsePaymentForm } from '@/modules/billing/form';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const dates: [string, string][] = [['issueDate', '2026-11-01'], ['dueDate', '2026-11-15'], ['notes', '']];

describe('parseInvoiceForm', () => {
  it('mengambil hanya baris dengan jumlah tagih lebih dari nol', () => {
    const r = parseInvoiceForm(fd([['orderId', '1'], ...dates, ['qty-5', '2.5'], ['qty-6', ''], ['qty-7', '0']]));
    expect(r).toEqual({
      ok: true,
      data: { issueDate: '2026-11-01', dueDate: '2026-11-15', notes: null, lines: [{ orderLineId: 5, quantity: 2.5 }] },
    });
  });

  it('menolak bila tidak ada baris atau jatuh tempo sebelum tanggal terbit', () => {
    expect(parseInvoiceForm(fd([...dates, ['qty-5', '']])).ok).toBe(false);
    expect(parseInvoiceForm(fd([['issueDate', '2026-11-10'], ['dueDate', '2026-11-01'], ['qty-5', '1']])).ok).toBe(false);
  });
});

describe('parsePaymentForm', () => {
  it('membaca jumlah, tanggal, metode (bawaan transfer), dan catatan', () => {
    expect(parsePaymentForm(fd([['amount', '1500.5'], ['paidOn', '2026-11-05'], ['method', ''], ['note', 'DP']]))).toEqual({
      ok: true,
      data: { amount: 1500.5, paidOn: '2026-11-05', method: 'transfer', note: 'DP' },
    });
  });

  it('menolak jumlah kosong atau nol, dan metode tak dikenal', () => {
    expect(parsePaymentForm(fd([['amount', ''], ['paidOn', '2026-11-05']])).ok).toBe(false);
    expect(parsePaymentForm(fd([['amount', '0'], ['paidOn', '2026-11-05']])).ok).toBe(false);
    expect(parsePaymentForm(fd([['amount', '5'], ['paidOn', '2026-11-05'], ['method', 'crypto']])).ok).toBe(false);
  });
});

describe('parseListParams dan listHref', () => {
  it('mengabaikan filter tak dikenal, membawa tanggal acuan, dan membentuk ulang tautan', () => {
    const q = parseListParams({ payment: 'bogus', page: '2', contact: '4' }, '2026-11-10');
    expect(q).toMatchObject({ payment: undefined, page: 2, contactId: 4, today: '2026-11-10' });
    expect(listHref(q)).toBe('/dashboard/invoices?contact=4&page=2');
    expect(listHref(parseListParams({ payment: 'overdue' }, '2026-11-10'), { page: 1 })).toBe('/dashboard/invoices?payment=overdue');
    expect(listHref(parseListParams({}, '2026-11-10'))).toBe('/dashboard/invoices');
  });
});
