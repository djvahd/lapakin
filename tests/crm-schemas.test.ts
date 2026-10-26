import { describe, expect, it } from 'vitest';
import {
  activityInputSchema,
  boardQuerySchema,
  listQuerySchema,
  moveInputSchema,
  opportunityInputSchema,
} from '@/modules/crm/schemas';

describe('opportunityInputSchema', () => {
  it('menerima input minimal dan memberi nilai bawaan', () => {
    expect(opportunityInputSchema.parse({ title: '  Proyek Toko  ' })).toEqual({
      title: 'Proyek Toko',
      contactId: null,
      stageId: null,
      expectedValue: 0,
      expectedCloseDate: null,
      priority: 0,
      ownerId: null,
      notes: null,
    });
  });

  it('menolak judul kosong', () => {
    expect(opportunityInputSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('nilai harapan: dibulatkan 2 desimal, tidak boleh negatif, batas atas, dan harus angka', () => {
    expect(opportunityInputSchema.parse({ title: 'A', expectedValue: 1234.567 }).expectedValue).toBe(1234.57);
    expect(opportunityInputSchema.parse({ title: 'A', expectedValue: 0.1 + 0.2 }).expectedValue).toBe(0.3);
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedValue: -1 }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedValue: 1e13 }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedValue: 'banyak' }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedValue: Number.NaN }).success).toBe(false);
  });

  it('tanggal tutup: kosong menjadi null, format salah dan tanggal fiktif ditolak', () => {
    expect(opportunityInputSchema.parse({ title: 'A', expectedCloseDate: '' }).expectedCloseDate).toBeNull();
    expect(opportunityInputSchema.parse({ title: 'A', expectedCloseDate: '2026-12-31' }).expectedCloseDate).toBe('2026-12-31');
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedCloseDate: '31-12-2026' }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedCloseDate: '2026-02-30' }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', expectedCloseDate: '2026-13-01' }).success).toBe(false);
  });

  it('prioritas 0 sampai 3 bilangan bulat', () => {
    expect(opportunityInputSchema.parse({ title: 'A', priority: 3 }).priority).toBe(3);
    expect(opportunityInputSchema.safeParse({ title: 'A', priority: 4 }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', priority: -1 }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', priority: 1.5 }).success).toBe(false);
  });

  it('id harus bilangan bulat positif', () => {
    expect(opportunityInputSchema.safeParse({ title: 'A', contactId: 0 }).success).toBe(false);
    expect(opportunityInputSchema.safeParse({ title: 'A', ownerId: -2 }).success).toBe(false);
    expect(opportunityInputSchema.parse({ title: 'A', contactId: 7, stageId: 3, ownerId: 9 })).toMatchObject({
      contactId: 7,
      stageId: 3,
      ownerId: 9,
    });
  });
});

describe('query dan pindah tahap', () => {
  it('boardQuerySchema dan listQuerySchema memberi nilai bawaan dan membatasi ukuran', () => {
    expect(boardQuerySchema.parse({})).toEqual({});
    expect(listQuerySchema.parse({})).toEqual({ archived: false, page: 1, pageSize: 20 });
    expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('moveInputSchema butuh tahap, alasan kalah opsional dan dirapikan', () => {
    expect(moveInputSchema.parse({ stageId: 4, lostReason: '  harga  ' })).toEqual({ stageId: 4, lostReason: 'harga' });
    expect(moveInputSchema.parse({ stageId: 4, lostReason: '' }).lostReason).toBeNull();
    expect(moveInputSchema.safeParse({}).success).toBe(false);
    expect(moveInputSchema.safeParse({ stageId: 4, lostReason: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('activityInputSchema', () => {
  it('menerima tindak lanjut yang lengkap', () => {
    expect(activityInputSchema.parse({ opportunityId: 5, kind: 'call', summary: ' Telepon klien ', dueDate: '2026-11-01' })).toEqual({
      opportunityId: 5,
      kind: 'call',
      summary: 'Telepon klien',
      dueDate: '2026-11-01',
      assignedTo: null,
    });
  });

  it('menolak jenis tak dikenal, ringkasan kosong, dan tanggal salah atau kosong', () => {
    const ok = { opportunityId: 5, kind: 'call', summary: 'x', dueDate: '2026-11-01' };
    expect(activityInputSchema.safeParse({ ...ok, kind: 'fax' }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...ok, summary: ' ' }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...ok, dueDate: '' }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...ok, dueDate: '2026-02-30' }).success).toBe(false);
    expect(activityInputSchema.safeParse({ ...ok, opportunityId: 0 }).success).toBe(false);
  });
});
