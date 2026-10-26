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

Pakai database **branch `production` di Neon**, bukan `dev`, dan jangan jalankan seed di sana (akun seed `test@test.com` / `admin123` tidak boleh ada di URL publik).

```bash
# 1. Migrasi ke branch production (POSTGRES_URL sementara di shell, jangan di .env)
POSTGRES_URL='<connection string branch production>' pnpm db:migrate

# 2. Login dan isi rahasia (nilai diketik di prompt, tidak muncul di layar)
pnpm exec wrangler login
pnpm exec wrangler secret put POSTGRES_URL
pnpm exec wrangler secret put AUTH_SECRET     # buat yang baru: openssl rand -base64 32
pnpm exec wrangler secret put BASE_URL        # isi setelah tahu URL workers.dev
pnpm exec wrangler secret put STRIPE_SECRET_KEY      # placeholder sampai Issue #12
pnpm exec wrangler secret put STRIPE_WEBHOOK_SECRET  # placeholder sampai Issue #12

# 3. Build dan deploy
pnpm run cf:deploy
```

Gunakan `pnpm run cf:deploy`, bukan `pnpm deploy`: `deploy` adalah perintah bawaan pnpm yang berbeda.

`cf:deploy` menyembunyikan `.env*` selama build, karena OpenNext membundel isi file itu ke dalam Worker. Rahasia produksi hanya lewat `wrangler secret put`, bukan `wrangler.jsonc` atau repo. `pnpm run cf:build` hanya membangun tanpa deploy.

## Catatan teknis

- **Driver database:** `lib/db/drizzle.ts` memakai `@neondatabase/serverless` (HTTP). Driver `postgres` gagal di `workerd` (`ERR_OPTION_NOT_IMPLEMENTED: options.rejectUnauthorized`). Driver HTTP tidak mendukung transaksi interaktif. Untuk RLS per-tenant gunakan `db.batch(...)`, dan untuk penguncian stok gunakan SQL atomik atau driver WebSocket per permintaan.
- **Middleware:** dijalankan sebagai Edge (tanpa `runtime: 'nodejs'`), karena Node middleware belum didukung penuh adapter.
- **Windows:** adapter membuat symlink bertipe file yang tidak bisa dibaca esbuild. `pnpm-workspace.yaml` memakai `nodeLinker: hoisted` agar tidak ada symlink pnpm, dan `verifyDepsBeforeRun: false` agar pnpm tidak memicu `install` ulang saat menjalankan skrip. Di Linux atau macOS keduanya bisa dilepas.
- **Next.js 16:** `experimental.ppr` dan `clientSegmentCache` dihapus karena tidak ada lagi di Next 16.
- **`/pricing`:** dirender saat request karena memanggil Stripe. Diganti di Issue #12.

## Checklist rilis (kode yang membawa migrasi)

Urutan ini wajib: kode baru bergantung pada skema baru, dan skema baru tidak merusak kode lama (kolom dan tabel hanya ditambah).

Di satu jendela Git Bash:

```bash
read -rs -p "Owner URL production (direct): " PROD_OWNER_URL; echo

# 1. Lihat apa yang belum diterapkan di production (hanya membaca)
MIGRATION_URL="$PROD_OWNER_URL" node scripts/migration-status.mjs

# 2. Terapkan migrasi sebagai pemilik
MIGRATION_URL="$PROD_OWNER_URL" pnpm db:migrate

# 3. Pastikan tidak ada yang PENDING
MIGRATION_URL="$PROD_OWNER_URL" node scripts/migration-status.mjs

unset PROD_OWNER_URL

# 4. Deploy kode (secret POSTGRES_URL tetap lapakin_app; tidak perlu diubah)
pnpm run cf:deploy
```

Lalu uji di situs produksi: masuk, buka halaman modul yang baru, dan buat satu data uji yang kemudian Anda hapus atau arsipkan.

Rollback: kode lama tetap berjalan di skema baru (hanya penambahan), jadi cukup deploy ulang versi sebelumnya dengan `wrangler rollback`; jangan membatalkan migrasi.

Tabel baru otomatis dapat hak untuk `lapakin_app` lewat default privileges (migrasi 0002), jadi tidak ada langkah GRANT tambahan.

### Catatan rilis modul Inventory (migrasi 0005)

- `0005_inventory.sql` membuat `inv_products`, `inv_variants`, `inv_stock_movements` dan mencabut `UPDATE`/`DELETE` pada `inv_stock_movements` dari `lapakin_app` (buku besar stok hanya bertambah). Pencabutan ada di akhir berkas, jadi berlaku setelah default privileges memberi hak ke tabel baru.
- Setelah deploy, uji di produksi: buka Inventory, buat produk uji, terima stok, coba keluarkan lebih dari stok (harus ditolak dengan pesan "Not enough stock"), lalu arsipkan produknya (hak arsip hanya owner).
- Mutasi stok tidak bisa dihapus atau diubah, jadi data uji hanya bisa diarsipkan, bukan dihapus.
