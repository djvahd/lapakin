import { describe, expect, it } from 'vitest';
import { listHref, parseContactForm, parseListParams } from '@/modules/contacts/form';
import { listQuerySchema } from '@/modules/contacts/schemas';

const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe('parseContactForm', () => {
  it('mengubah checkbox, company, dan tag berulang menjadi input bertipe', () => {
    const r = parseContactForm(
      fd([
        ['kind', 'person'],
        ['name', ' Siti '],
        ['companyId', '7'],
        ['email', 'siti@x.test'],
        ['isCustomer', 'on'],
        ['tagIds', '2'],
        ['tagIds', '3'],
        ['tagIds', '2'],
      ])
    );
    expect(r).toMatchObject({
      ok: true,
      data: { kind: 'person', name: 'Siti', companyId: 7, isCustomer: true, isSupplier: false, tagIds: [2, 3] },
    });
  });

  it('checkbox yang tidak dicentang menjadi false dan company kosong menjadi null', () => {
    const r = parseContactForm(fd([['kind', 'company'], ['name', 'PT X'], ['companyId', '']]));
    expect(r).toMatchObject({ ok: true, data: { companyId: null, isCustomer: false, isSupplier: false, tagIds: [] } });
  });

  it('mengembalikan pesan kesalahan pertama yang bisa dibaca', () => {
    expect(parseContactForm(fd([['kind', 'person'], ['name', '  ']]))).toEqual({ ok: false, error: 'Name is required' });
    expect(parseContactForm(fd([['kind', 'person'], ['name', 'A'], ['email', 'salah']]))).toEqual({
      ok: false,
      error: 'Invalid email address',
    });
    expect(parseContactForm(fd([['kind', 'company'], ['name', 'A'], ['companyId', '3']]))).toEqual({
      ok: false,
      error: 'Only a person can belong to a company',
    });
  });

  it('id company atau tag yang bukan angka ditolak, bukan diam-diam menjadi 0', () => {
    expect(parseContactForm(fd([['kind', 'person'], ['name', 'A'], ['companyId', 'abc']])).ok).toBe(false);
    expect(parseContactForm(fd([['kind', 'person'], ['name', 'A'], ['tagIds', 'x']])).ok).toBe(false);
  });
});

describe('parseListParams', () => {
  it('membaca parameter yang valid', () => {
    expect(parseListParams({ q: ' budi ', kind: 'company', role: 'supplier', tag: '4', archived: '1', page: '3' })).toEqual({
      q: 'budi',
      kind: 'company',
      role: 'supplier',
      tagId: 4,
      archived: true,
      page: 3,
      pageSize: 20,
    });
  });

  it('mengabaikan nilai tidak valid satu per satu tanpa membatalkan yang lain', () => {
    expect(parseListParams({ q: 'x', kind: 'robot', role: 'investor', tag: '-1', page: '0', archived: 'yes' })).toEqual({
      q: 'x',
      archived: false,
      page: 1,
      pageSize: 20,
    });
  });

  it('memakai nilai pertama bila parameter berulang dan memberi nilai bawaan bila kosong', () => {
    expect(parseListParams({ q: ['a', 'b'] }).q).toBe('a');
    expect(parseListParams({})).toEqual({ archived: false, page: 1, pageSize: 20 });
  });
});

describe('listHref', () => {
  const base = listQuerySchema.parse({});

  it('tanpa filter menghasilkan alamat polos', () => {
    expect(listHref(base)).toBe('/dashboard/contacts');
  });

  it('menyertakan filter aktif dan melewatkan halaman 1', () => {
    const q = listQuerySchema.parse({ q: 'a b', kind: 'person', tagId: 2, archived: true });
    expect(listHref(q)).toBe('/dashboard/contacts?q=a+b&kind=person&tag=2&archived=1');
    expect(listHref(q, { page: 3 })).toBe('/dashboard/contacts?q=a+b&kind=person&tag=2&archived=1&page=3');
  });

  it('hasilnya bisa dibaca kembali menjadi query yang sama', () => {
    const q = listQuerySchema.parse({ q: 'toko & co', role: 'customer', page: 2 });
    const params = Object.fromEntries(new URL(listHref(q), 'http://x').searchParams);
    expect(parseListParams(params)).toEqual(q);
  });
});
