# Deploy ke Cloudflare Workers (Issue #13)

Aplikasi dijalankan di Cloudflare Workers lewat adapter [OpenNext](https://opennext.js.org/cloudflare), dengan Neon sebagai database.

## Prasyarat

- `pnpm install` sudah dijalankan (lihat `pnpm-workspace.yaml`).
- `.env` berisi `POSTGRES_URL` dan `AUTH_SECRET` (lihat `docs/setup-neon.md`).
- Untuk deploy: akun Cloudflare dan `pnpm exec wrangler login`.

## Preview lokal di runtime Workers

1. Salin variabel rahasia ke `.dev.vars` (file ini di `.gitignore`):

   ```
   NEXTJS_ENV=development
   POSTGRES_URL=...
   AUTH_SECRET=...
   BASE_URL=http://127.0.0.1:8787
   STRIPE_SECRET_KEY=sk_test_placeholder
   STRIPE_WEBHOOK_SECRET=whsec_placeholder
   ```

2. Jalankan:

   ```bash
   pnpm preview
   ```

3. Buka http://127.0.0.1:8787/sign-in dan masuk dengan akun seed.

## Deploy

```bash
pnpm exec wrangler login
pnpm exec wrangler secret put POSTGRES_URL
pnpm exec wrangler secret put AUTH_SECRET
pnpm deploy
```

Rahasia dimasukkan lewat `wrangler secret put`, bukan ke `wrangler.jsonc` atau repo.

## Catatan teknis

- **Driver database:** `lib/db/drizzle.ts` memakai `@neondatabase/serverless` (HTTP). Driver `postgres` gagal di `workerd` (`ERR_OPTION_NOT_IMPLEMENTED: options.rejectUnauthorized`). Driver HTTP tidak mendukung transaksi interaktif. Untuk RLS per-tenant gunakan `db.batch(...)`, dan untuk penguncian stok gunakan SQL atomik atau driver WebSocket per permintaan.
- **Middleware:** dijalankan sebagai Edge (tanpa `runtime: 'nodejs'`), karena Node middleware belum didukung penuh adapter.
- **Windows:** adapter membuat symlink bertipe file yang tidak bisa dibaca esbuild. `pnpm-workspace.yaml` memakai `nodeLinker: hoisted` agar tidak ada symlink pnpm, dan `verifyDepsBeforeRun: false` agar pnpm tidak memicu `install` ulang saat menjalankan skrip. Di Linux atau macOS keduanya bisa dilepas.
- **Next.js 16:** `experimental.ppr` dan `clientSegmentCache` dihapus karena tidak ada lagi di Next 16.
- **`/pricing`:** dirender saat request karena memanggil Stripe. Diganti di Issue #12.
