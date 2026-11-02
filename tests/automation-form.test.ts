import { describe, expect, it } from 'vitest';
import { parseRuleForm } from '@/modules/automation/form';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

const base: [string, string][] = [
  ['name', 'Tagih'],
  ['event', 'invoice.overdue'],
  ['action', 'notify'],
  ['title', 'Invoice {{number}} overdue'],
  ['body', ''],
  ['link', '/dashboard/invoices/{{invoiceId}}'],
  ['recipient', 'owners'],
  ['active', 'on'],
];

describe('parseRuleForm', () => {
  it('membaca kondisi sejajar, melewati baris tanpa bidang, dan mengisi aksi notify', () => {
    const r = parseRuleForm(
      fd([...base, ['condField', 'daysOverdue'], ['condOp', 'gte'], ['condValue', '3'], ['condField', ''], ['condOp', 'eq'], ['condValue', '']])
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.conditions).toEqual([{ field: 'daysOverdue', op: 'gte', value: '3' }]);
    expect(r.data).toMatchObject({ name: 'Tagih', event: 'invoice.overdue', action: 'notify', active: true });
    expect(r.data.actionConfig).toMatchObject({ title: 'Invoice {{number}} overdue', body: null, recipient: 'owners' });
  });

  it('kotak aktif yang tidak dicentang berarti nonaktif', () => {
    const r = parseRuleForm(fd(base.filter(([k]) => k !== 'active')));
    expect(r.ok && r.data.active).toBe(false);
  });

  it('menolak nama kosong, peristiwa tak dikenal, bidang di luar peristiwa, dan tautan luar', () => {
    expect(parseRuleForm(fd(base.map(([k, v]) => (k === 'name' ? [k, ''] : [k, v])))).ok).toBe(false);
    expect(parseRuleForm(fd(base.map(([k, v]) => (k === 'event' ? [k, 'x.y'] : [k, v])))).ok).toBe(false);
    expect(parseRuleForm(fd([...base, ['condField', 'summary'], ['condOp', 'eq'], ['condValue', 'x']])).ok).toBe(false);
    expect(parseRuleForm(fd(base.map(([k, v]) => (k === 'link' ? [k, 'https://evil.test'] : [k, v])))).ok).toBe(false);
  });
});
