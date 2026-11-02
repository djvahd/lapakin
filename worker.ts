// Entri Worker: membungkus worker hasil build OpenNext agar bisa menerima Cron Trigger.
// `fetch` tetap ditangani Next.js; `scheduled` memanggil endpoint internal /api/cron/automation
// lewat handler yang sama, dengan rahasia CRON_SECRET (wrangler secret put CRON_SECRET).
// @ts-ignore berkas ini dihasilkan oleh `opennextjs-cloudflare build` (ada atau tidak saat typecheck)
import handler from './.open-next/worker.js';

type Env = { CRON_SECRET?: string; BASE_URL?: string } & Record<string, unknown>;

export default {
  fetch: handler.fetch,

  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    if (!env.CRON_SECRET) {
      console.error('CRON_SECRET belum diisi; pekerjaan terjadwal dilewati');
      return;
    }
    const base = env.BASE_URL || 'https://lapakin.internal';
    const request = new Request(`${base}/api/cron/automation`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    ctx.waitUntil(
      (handler.fetch(request, env, ctx) as Promise<Response>).then(async (res) => {
        if (!res.ok) console.error(`Cron automation gagal: ${res.status} ${await res.text()}`);
      })
    );
  },
};
