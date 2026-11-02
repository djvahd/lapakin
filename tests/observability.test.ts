import { describe, expect, it } from 'vitest';
import { formatRequestError } from '@/lib/observability';
import { GET, HEAD } from '@/app/api/health/route';

describe('formatRequestError', () => {
  it('mencatat metadata permintaan tanpa query string, header, atau body', () => {
    const req = {
      path: '/dashboard/invoices/5?token=rahasia&email=a@b.test',
      method: 'POST',
      headers: { cookie: 'session=abc' },
    };
    const out = formatRequestError(new TypeError('boom'), req, { routePath: '/dashboard/invoices/[id]', routeType: 'action', routerKind: 'App Router' });
    expect(out).toMatchObject({
      level: 'error',
      event: 'request_error',
      message: 'boom',
      name: 'TypeError',
      method: 'POST',
      path: '/dashboard/invoices/5',
      routePath: '/dashboard/invoices/[id]',
      routeType: 'action',
    });
    const text = JSON.stringify(out);
    expect(text).not.toContain('rahasia');
    expect(text).not.toContain('session=abc');
    expect(text).not.toContain('a@b.test');
  });

  it('menangani nilai yang bukan Error, menyertakan digest, dan memotong pesan panjang', () => {
    expect(formatRequestError('teks biasa', { path: '/', method: 'GET' }).message).toBe('teks biasa');
    const withDigest = Object.assign(new Error('x'), { digest: '12345' });
    expect(formatRequestError(withDigest, { path: '/', method: 'GET' }).digest).toBe('12345');
    expect(formatRequestError(new Error('a'.repeat(1000)), { path: '/', method: 'GET' }).message).toHaveLength(300);
  });
});

describe('health route', () => {
  it('menjawab 200 dengan status ok bila database terjangkau, tanpa detail tambahan', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('HEAD juga didukung untuk pemantau yang memakai HEAD', async () => {
    expect((await HEAD()).status).toBe(200);
  });
});
