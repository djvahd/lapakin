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
   MIDTRANS_SERVER_KEY=...        # opsional untuk uji lokal; kunci sandbox
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
pnpm exec wrangler secret put MIDTRANS_SERVER_KEY   # kunci sandbox dulu; produksi setelah akun disetujui

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
- **`/pricing`:** dirender saat request karena membaca sesi dan status langganan.

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

### Catatan rilis modul Sales (migrasi 0006)

- `0006_sales.sql` membuat `sales_orders`, `sales_lines`, `sales_deliveries`, `sales_delivery_lines` (RLS, kunci asing komposit ke kontak, peluang CRM, dan varian Inventory). Tidak ada pencabutan hak; hak DML datang dari default privileges (migrasi 0002).
- Setelah deploy, uji di produksi: buat penawaran dari halaman peluang CRM (tombol "+ New quotation"), konfirmasi, catat pengiriman sebagian (stok varian harus berkurang di Inventory), lalu coba kirim lebih dari sisa (harus ditolak).
- Pengiriman memakai mutasi stok jenis `sale` yang tidak bisa dihapus. Pesanan yang sudah punya pengiriman tidak bisa dibatalkan, jadi data uji dengan pengiriman tetap tersimpan; gunakan produk uji yang bisa diarsipkan.
- Pajak (PPN) belum ada di Sales; ditangani di modul Invoicing.

### Catatan rilis modul Invoicing (migrasi 0007)

- `0007_invoicing.sql` membuat `bill_invoices`, `bill_lines`, `bill_payments` (awalan `bill_` karena `inv_` milik Inventory) dan mencabut `UPDATE`/`DELETE` pada `bill_payments` dari `lapakin_app` (pembayaran hanya bertambah). Pencabutan ada di akhir berkas, jadi berlaku setelah default privileges.
- Setelah deploy, uji di produksi: dari pesanan terkonfirmasi buat faktur (boleh sebagian), terbitkan, catat pembayaran sebagian lalu sisanya, coba bayar lebih dari sisa (harus ditolak), buka Print / PDF, dan periksa ringkasan piutang di halaman Invoices.
- Pembayaran tidak bisa dihapus atau diubah, dan faktur yang sudah menerima pembayaran tidak bisa dibatalkan, jadi data uji dengan pembayaran tetap tersimpan.
- PDF dibuat lewat dialog cetak peramban ("Save as PDF"), tanpa library, sehingga tidak ada dependensi baru di Workers.
- Belum ada: pengingat tagih otomatis (menunggu mesin otomasi, issue #18) dan pembayaran lewat gateway (issue #12). PPN dan e-Faktur juga belum.

### Catatan rilis mesin otomasi dan Cron Trigger (migrasi 0008)

- `0008_automation.sql` membuat `auto_rules`, `auto_runs`, `auto_notifications` (RLS). Hak DML datang dari default privileges (migrasi 0002).
- `wrangler.jsonc` kini memakai `worker.ts` sebagai entri: ia membungkus worker hasil build OpenNext dan menambahkan handler `scheduled`. Cron berjalan harian pukul 01:00 UTC (08:00 WIB) dan memanggil `POST /api/cron/automation` lewat handler yang sama.
- **Wajib sebelum deploy:** `pnpm exec wrangler secret put CRON_SECRET` (nilai acak panjang). Tanpa itu endpoint menjawab 503 dan handler `scheduled` melewati pekerjaannya dengan log kesalahan. `BASE_URL` yang sudah ada dipakai sebagai alamat dasar permintaan internal.
- `workers_dev` dibuat eksplisit `true` (situs tetap di workers.dev sampai ada domain kustom) dan `preview_urls` `false` (URL pratinjau per versi tidak lagi publik).
- Setelah deploy, uji: buat aturan di Automation untuk "Invoice is overdue", pastikan ada faktur terbit yang lewat tempo, lalu picu cron dari dasbor Cloudflare (Workers, lapakin, Triggers) atau tunggu jadwalnya; cek Notifications dan riwayat eksekusi aturan. Panggilan manual: `curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<url>/api/cron/automation`.
- Pengingat diulang paling cepat seminggu sekali per faktur dan per aturan. Pemindaian harian menelusuri semua toko; toko tanpa aturan aktif hanya memakan satu query.
- Hanya notifikasi di dalam aplikasi. Email dan WhatsApp belum ada (tambahkan sebagai aksi baru di `modules/automation/handlers.ts`).

### Catatan rilis pembayaran Midtrans (migrasi 0009)

- `0009_midtrans_subscriptions.sql` hanya menambah: tabel `sub_payments` (RLS) dan kolom `teams.plan_expires_at`. Kolom `stripe_*` dibiarkan agar rollback kode lama aman; hapus lewat migrasi tersendiri nanti. Dependensi `stripe` dan rute `/api/stripe/*` sudah dihapus.
- Model: bayar per periode lewat Midtrans Snap (QRIS, virtual account, e-wallet, kartu), tanpa tagihan otomatis. Satu pembayaran memperpanjang `plan_expires_at` satu bulan atau satu tahun, menyambung dari tanggal berakhir bila paket masih aktif. Harga ada di `lib/payments/plans.ts` (Pro: Rp99.000/bulan, Rp990.000/tahun).
- **Wajib sebelum dipakai:** `pnpm exec wrangler secret put MIDTRANS_SERVER_KEY` (kunci **sandbox** dulu). Untuk produksi pasang kunci produksi dan `pnpm exec wrangler secret put MIDTRANS_IS_PRODUCTION` dengan nilai `true`. Tanpa kunci, tombol bayar menampilkan "Midtrans is not configured" dan bagian lain tetap berjalan.
- **Notification URL di dasbor Midtrans** (Settings, Configuration, Payment Notification URL): `https://<url>/api/midtrans/webhook`. Sandbox dan produksi punya pengaturan terpisah. Endpoint memverifikasi tanda tangan SHA512 dengan server key, mencocokkan jumlah, dan idempoten (kiriman ulang tidak memperpanjang dua kali).
- Uji sandbox: buka `/pricing` sebagai owner, pilih bulanan, bayar dengan metode uji di simulator Midtrans, lalu cek kartu Team Subscription di dashboard (Pro, aktif sampai tanggal baru) dan riwayat Activity. Cek juga Midtrans dashboard, Transactions, bahwa notifikasi terkirim dengan status 200.
- Belum ada: pembatasan fitur per paket (Free dan Pro saat ini sama), pengingat perpanjangan otomatis (bisa dibuat dengan peristiwa baru di mesin otomasi), refund/chargeback (diabaikan webhook, ditangani manual), dan uji ke sandbox sungguhan (butuh server key sandbox).
