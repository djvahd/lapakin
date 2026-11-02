import { describe, expect, it } from 'vitest';
import { matches, render } from '@/modules/automation/engine';
import { ruleInputSchema } from '@/modules/automation/schemas';

describe('matches', () => {
  it('semua kondisi harus terpenuhi; tanpa kondisi selalu cocok', () => {
    expect(matches([], { a: 1 })).toBe(true);
    const p = { balance: 5000, contact: 'Budi', daysOverdue: 3 };
    expect(matches([{ field: 'balance', op: 'gte', value: 5000 }, { field: 'contact', op: 'eq', value: 'Budi' }], p)).toBe(true);
    expect(matches([{ field: 'balance', op: 'gt', value: 5000 }], p)).toBe(false);
    expect(matches([{ field: 'daysOverdue', op: 'lt', value: 7 }, { field: 'contact', op: 'neq', value: 'Budi' }], p)).toBe(false);
  });

  it('membandingkan angka sebagai angka (termasuk teks numerik) dan menolak bidang yang tidak ada', () => {
    expect(matches([{ field: 'n', op: 'eq', value: 10 }], { n: '10' })).toBe(true);
    expect(matches([{ field: 'n', op: 'gt', value: '9' }], { n: 10 })).toBe(true);
    expect(matches([{ field: 'n', op: 'gt', value: 1 }], { n: 'abc' })).toBe(false);
    expect(matches([{ field: 'x', op: 'eq', value: 1 }], {})).toBe(false);
    expect(matches([{ field: 'x', op: 'neq', value: 1 }], { x: null })).toBe(false);
  });
});

describe('render', () => {
  it('mengganti {{bidang}} dan mengosongkan yang tidak ada', () => {
    expect(render('Invoice {{number}} for {{ contact }} is late', { number: 'F0001', contact: 'Budi' })).toBe('Invoice F0001 for Budi is late');
    expect(render('Hi {{missing}}!', {})).toBe('Hi !');
  });
});

describe('ruleInputSchema', () => {
  const base = {
    name: 'Remind',
    event: 'invoice.overdue',
    action: 'notify',
    actionConfig: { title: 'Invoice {{number}} overdue', link: '/dashboard/invoices/{{invoiceId}}' },
  };

  it('menerima aturan sah dan membersihkan konfigurasi aksi (recipient bawaan owners)', () => {
    const r = ruleInputSchema.parse({ ...base, conditions: [{ field: 'daysOverdue', op: 'gte', value: 1 }] });
    expect(r.active).toBe(true);
    expect(r.actionConfig).toMatchObject({ title: 'Invoice {{number}} overdue', recipient: 'owners', body: null });
  });

  it('menolak peristiwa tak dikenal, bidang kondisi di luar peristiwa, dan tautan luar', () => {
    expect(ruleInputSchema.safeParse({ ...base, event: 'nope' }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, conditions: [{ field: 'summary', op: 'eq', value: 'x' }] }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, actionConfig: { title: 'x', link: 'https://evil.test' } }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, actionConfig: { title: 'x', link: '//evil.test' } }).success).toBe(false);
    expect(ruleInputSchema.safeParse({ ...base, actionConfig: { title: '' } }).success).toBe(false);
  });
});
