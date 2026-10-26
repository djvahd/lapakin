import { describe, expect, it } from 'vitest';
import {
  boardHref,
  parseActivityForm,
  parseBoardParams,
  parseMoveForm,
  parseOpportunityForm,
} from '@/modules/crm/form';
import { formatDate, formatMoney, isOverdue, todayIn } from '@/modules/crm/format';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe('parseOpportunityForm', () => {
  it('membaca semua kolom dan mengubah id kosong menjadi null', () => {
    const r = parseOpportunityForm(
      fd([
        ['title', ' Proyek Besar '],
        ['contactId', '7'],
        ['expectedValue', '1500000.5'],
        ['expectedCloseDate', '2026-12-31'],
        ['priority', '2'],
        ['ownerId', ''],
        ['notes', 'penting'],
      ])
    );
    expect(r).toEqual({
      ok: true,
      data: {
        title: 'Proyek Besar',
        contactId: 7,
        stageId: null,
        expectedValue: 1500000.5,
        expectedCloseDate: '2026-12-31',
        priority: 2,
        ownerId: null,
        notes: 'penting',
      },
    });
  });

  it('nilai kosong menjadi 0 dan prioritas kosong menjadi 0', () => {
    expect(parseOpportunityForm(fd([['title', 'A'], ['expectedValue', ''], ['priority', '']]))).toMatchObject({
      ok: true,
      data: { expectedValue: 0, priority: 0 },
    });
  });

  it('menolak nilai berformat ambigu atau bukan angka dengan pesan yang membantu', () => {
    const msg = 'Enter the expected value as a plain number, for example 1500000 or 1500000.50';
    for (const bad of ['1.500.000', '1,5', '-5', 'abc', '1e6', '12.345']) {
      expect(parseOpportunityForm(fd([['title', 'A'], ['expectedValue', bad]]))).toEqual({ ok: false, error: msg });
    }
  });

  it('pesan kesalahan dari skema: judul, tanggal, batas nilai, dan prioritas', () => {
    expect(parseOpportunityForm(fd([['title', '  ']]))).toEqual({ ok: false, error: 'Title is required' });
    expect(parseOpportunityForm(fd([['title', 'A'], ['expectedCloseDate', '2026-02-30']]))).toEqual({
      ok: false,
      error: 'Not a valid date',
    });
    expect(parseOpportunityForm(fd([['title', 'A'], ['expectedValue', '9999999999999']])).ok).toBe(false);
    expect(parseOpportunityForm(fd([['title', 'A'], ['priority', '7']])).ok).toBe(false);
  });

  it('id bukan angka ditolak, bukan diam-diam menjadi 0', () => {
    expect(parseOpportunityForm(fd([['title', 'A'], ['contactId', 'x']])).ok).toBe(false);
    expect(parseOpportunityForm(fd([['title', 'A'], ['ownerId', '0']])).ok).toBe(false);
  });
});

describe('parseMoveForm dan parseActivityForm', () => {
  it('pindah tahap: butuh tahap, alasan kalah dirapikan', () => {
    expect(parseMoveForm(fd([['stageId', '4'], ['lostReason', ' harga ']]))).toEqual({
      ok: true,
      data: { stageId: 4, lostReason: 'harga' },
    });
    expect(parseMoveForm(fd([['stageId', '']]))).toEqual({ ok: false, error: 'Choose a stage' });
    expect(parseMoveForm(fd([]))).toEqual({ ok: false, error: 'Choose a stage' });
  });

  it('aktivitas: kolom lengkap diterima, penugasan kosong menjadi null', () => {
    expect(
      parseActivityForm(fd([['opportunityId', '5'], ['kind', 'meeting'], ['summary', ' Rapat '], ['dueDate', '2026-11-10'], ['assignedTo', '']]))
    ).toEqual({ ok: true, data: { opportunityId: 5, kind: 'meeting', summary: 'Rapat', dueDate: '2026-11-10', assignedTo: null } });
  });

  it('aktivitas: pesan yang jelas untuk tanggal, peluang, dan ringkasan', () => {
    const base: [string, string][] = [['opportunityId', '5'], ['kind', 'call'], ['summary', 'x'], ['dueDate', '2026-11-10']];
    const without = (key: string) => base.filter(([k]) => k !== key);
    expect(parseActivityForm(fd(without('dueDate')))).toEqual({ ok: false, error: 'Choose a due date' });
    expect(parseActivityForm(fd(without('opportunityId')))).toEqual({ ok: false, error: 'Opportunity not found' });
    expect(parseActivityForm(fd([...without('summary'), ['summary', ' ']]))).toEqual({ ok: false, error: 'Summary is required' });
    expect(parseActivityForm(fd([...without('kind'), ['kind', 'fax']])).ok).toBe(false);
  });
});

describe('parseBoardParams dan boardHref', () => {
  it('membaca parameter yang valid dan mengabaikan yang rusak satu per satu', () => {
    expect(parseBoardParams({ q: ' proyek ', owner: '3', archived: '1' })).toEqual({ q: 'proyek', ownerId: 3, archived: true });
    expect(parseBoardParams({ q: 'x', owner: 'abc', archived: 'yes' })).toEqual({ q: 'x', archived: false });
    expect(parseBoardParams({})).toEqual({ archived: false });
  });

  it('membuat tautan polos tanpa filter dan menulis filter aktif', () => {
    expect(boardHref({})).toBe('/dashboard/crm');
    expect(boardHref({ q: 'a b', ownerId: 2, archived: true })).toBe('/dashboard/crm?q=a+b&owner=2&archived=1');
  });

  it('tautan bisa dibaca kembali menjadi query yang sama', () => {
    const q = { q: 'toko & co', ownerId: 9, archived: true };
    const params = Object.fromEntries(new URL(boardHref(q), 'http://x').searchParams);
    expect(parseBoardParams(params)).toEqual(q);
  });
});

describe('format tampilan', () => {
  it('formatMoney menulis rupiah tanpa desimal', () => {
    expect(formatMoney(1500000)).toMatch(/Rp.*1\.500\.000/);
    expect(formatMoney(0)).toMatch(/Rp.*0/);
    expect(formatMoney(1234.56)).toMatch(/Rp.*1\.235/);
  });

  it('formatDate memakai tanggal kalender tanpa pergeseran zona waktu', () => {
    expect(formatDate('2026-11-05')).toBe('5 Nov 2026');
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('bukan-tanggal')).toBe('bukan-tanggal');
  });

  it('todayIn mengikuti zona waktu Jakarta (UTC+7), termasuk melewati tengah malam UTC', () => {
    expect(todayIn('Asia/Jakarta', new Date('2026-10-26T20:00:00Z'))).toBe('2026-10-27');
    expect(todayIn('Asia/Jakarta', new Date('2026-10-26T16:59:00Z'))).toBe('2026-10-26');
    expect(todayIn('UTC', new Date('2026-10-26T20:00:00Z'))).toBe('2026-10-26');
  });

  it('isOverdue: hanya bila sebelum hari ini; hari ini dan kosong tidak terlambat', () => {
    expect(isOverdue('2026-10-25', '2026-10-26')).toBe(true);
    expect(isOverdue('2026-10-26', '2026-10-26')).toBe(false);
    expect(isOverdue('2026-10-27', '2026-10-26')).toBe(false);
    expect(isOverdue(null, '2026-10-26')).toBe(false);
    expect(isOverdue(undefined, '2026-10-26')).toBe(false);
  });
});
