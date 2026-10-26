import { describe, expect, it } from 'vitest';
import { contactInputSchema, listQuerySchema, tagInputSchema } from '@/modules/contacts/schemas';

describe('contactInputSchema', () => {
  it('menerima input minimal dan memberi nilai bawaan', () => {
    const r = contactInputSchema.parse({ kind: 'person', name: '  Budi  ' });
    expect(r).toEqual({
      kind: 'person',
      name: 'Budi',
      companyId: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
      isCustomer: false,
      isSupplier: false,
      tagIds: [],
    });
  });

  it('string kosong pada field opsional menjadi null', () => {
    const r = contactInputSchema.parse({
      kind: 'company',
      name: 'PT Maju',
      email: '',
      phone: '  ',
      address: '',
      notes: '',
    });
    expect(r.email).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.address).toBeNull();
    expect(r.notes).toBeNull();
  });

  it('menolak nama kosong atau hanya spasi', () => {
    expect(contactInputSchema.safeParse({ kind: 'person', name: '' }).success).toBe(false);
    expect(contactInputSchema.safeParse({ kind: 'person', name: '   ' }).success).toBe(false);
  });

  it('menolak email tidak valid dan menerima yang valid', () => {
    expect(contactInputSchema.safeParse({ kind: 'person', name: 'A', email: 'bukan-email' }).success).toBe(false);
    expect(contactInputSchema.parse({ kind: 'person', name: 'A', email: ' a@b.co ' }).email).toBe('a@b.co');
  });

  it('menolak jenis di luar person dan company', () => {
    expect(contactInputSchema.safeParse({ kind: 'robot', name: 'A' }).success).toBe(false);
  });

  it('hanya orang yang boleh punya perusahaan', () => {
    const bad = contactInputSchema.safeParse({ kind: 'company', name: 'PT', companyId: 5 });
    expect(bad.success).toBe(false);
    expect(bad.success ? '' : bad.error.issues[0].path).toEqual(['companyId']);
    expect(contactInputSchema.safeParse({ kind: 'person', name: 'A', companyId: 5 }).success).toBe(true);
  });

  it('tagIds dideduplikasi dan harus bilangan bulat positif', () => {
    expect(contactInputSchema.parse({ kind: 'person', name: 'A', tagIds: [2, 2, 3] }).tagIds).toEqual([2, 3]);
    expect(contactInputSchema.safeParse({ kind: 'person', name: 'A', tagIds: [0] }).success).toBe(false);
    expect(contactInputSchema.safeParse({ kind: 'person', name: 'A', tagIds: [1.5] }).success).toBe(false);
  });

  it('membatasi panjang field', () => {
    expect(contactInputSchema.safeParse({ kind: 'person', name: 'x'.repeat(201) }).success).toBe(false);
    expect(contactInputSchema.safeParse({ kind: 'person', name: 'A', phone: '1'.repeat(51) }).success).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('memberi nilai bawaan', () => {
    expect(listQuerySchema.parse({})).toEqual({ archived: false, page: 1, pageSize: 20 });
  });

  it('membatasi halaman dan ukuran halaman', () => {
    expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ role: 'investor' }).success).toBe(false);
  });
});

describe('tagInputSchema', () => {
  it('menerima nama dan warna heksadesimal, warna opsional', () => {
    expect(tagInputSchema.parse({ name: ' VIP ' })).toEqual({ name: 'VIP', color: null });
    expect(tagInputSchema.parse({ name: 'VIP', color: '#a1B2c3' }).color).toBe('#a1B2c3');
  });

  it('menolak nama kosong dan warna yang salah format', () => {
    expect(tagInputSchema.safeParse({ name: ' ' }).success).toBe(false);
    expect(tagInputSchema.safeParse({ name: 'VIP', color: 'red' }).success).toBe(false);
  });
});
