import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { can } from '@/lib/auth/permissions';

const ctx = vi.hoisted(() => ({
  current: null as null | { user: { id: number }; teamId: number; role: string }
}));

vi.mock('@/lib/auth/tenant', () => ({
  getTenantContext: async () => ctx.current
}));

import { validatedActionWithTenant } from '@/lib/auth/middleware';

describe('can()', () => {
  it('owner boleh semua izin yang ada', () => {
    for (const p of ['team:update', 'member:invite', 'member:remove', 'billing:manage', 'contact:archive', 'contact:tag-manage', 'crm:archive', 'crm:stage-manage'] as const) {
      expect(can('owner', p)).toBe(true);
    }
  });

  it('member tidak boleh mengubah toko, mengundang, menghapus anggota, atau billing', () => {
    for (const p of ['team:update', 'member:invite', 'member:remove', 'billing:manage', 'contact:archive', 'contact:tag-manage', 'crm:archive', 'crm:stage-manage'] as const) {
      expect(can('member', p)).toBe(false);
    }
  });

  it('role kosong atau tidak dikenal ditolak', () => {
    expect(can(null, 'team:update')).toBe(false);
    expect(can(undefined, 'team:update')).toBe(false);
    expect(can('admin', 'team:update')).toBe(false);
    expect(can('', 'team:update')).toBe(false);
  });
});

describe('validatedActionWithTenant', () => {
  const schema = z.object({ name: z.string().min(1, 'Name is required') });
  const form = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const run = vi.fn(async () => ({ success: 'ok' }));

  beforeEach(() => {
    run.mockClear();
    ctx.current = { user: { id: 1 }, teamId: 10, role: 'owner' };
  });

  it('member ditolak di server dan aksi tidak dijalankan', async () => {
    ctx.current = { user: { id: 2 }, teamId: 10, role: 'member' };
    const action = validatedActionWithTenant(schema, 'team:update', run);
    const result = await action({}, form({ name: 'Toko' }));
    expect(result).toEqual({ error: 'You do not have permission to do this.' });
    expect(run).not.toHaveBeenCalled();
  });

  it('owner lolos dan menerima konteks toko', async () => {
    const action = validatedActionWithTenant(schema, 'team:update', run);
    const result = await action({}, form({ name: 'Toko' }));
    expect(result).toEqual({ success: 'ok' });
    expect(run).toHaveBeenCalledWith({ name: 'Toko' }, expect.any(FormData), ctx.current);
  });

  it('permission null mengizinkan semua anggota', async () => {
    ctx.current = { user: { id: 2 }, teamId: 10, role: 'member' };
    const action = validatedActionWithTenant(schema, null, run);
    expect(await action({}, form({ name: 'x' }))).toEqual({ success: 'ok' });
  });

  it('input tidak valid ditolak sebelum aksi dijalankan', async () => {
    const action = validatedActionWithTenant(schema, 'team:update', run);
    expect(await action({}, form({ name: '' }))).toEqual({ error: 'Name is required' });
    expect(run).not.toHaveBeenCalled();
  });

  it('tanpa konteks (belum masuk atau bukan anggota) melempar error', async () => {
    ctx.current = null;
    const action = validatedActionWithTenant(schema, null, run);
    await expect(action({}, form({ name: 'x' }))).rejects.toThrow('not authenticated');
  });
});
