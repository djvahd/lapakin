# Lapakin

ERP dan CRM ringan untuk usaha kecil dan menengah (jasa dan perdagangan), dalam satu aplikasi web multi-toko. Mengadaptasi layanan Odoo versi ringan: dari kontak dan peluang penjualan sampai stok, penawaran, pengiriman, faktur, dan pembayaran.

Live: https://lapakin.adrielharjanto.workers.dev

## Fitur (v1)

| Modul | Isi |
|---|---|
| Kontak | Pelanggan dan pemasok, perusahaan dan orang, tag, arsip |
| CRM | Peluang di papan tahapan, tindak lanjut, nilai pipeline tertimbang |
| Inventory | Produk dan varian, stok dari buku besar mutasi (tidak pernah minus), peringatan stok menipis |
| Penjualan | Penawaran menjadi pesanan, pengiriman sebagian atau penuh yang mengurangi stok |
| Faktur | Faktur dari pesanan (boleh sebagian), pembayaran sebagian, piutang, cetak PDF |
| Otomasi | Aturan "jika terjadi X maka beri tahu" (faktur lewat tempo, tindak lanjut terlambat, paket segera berakhir) dan notifikasi dalam aplikasi |
| Langganan | Paket Free dan Pro, pembayaran per periode lewat Midtrans Snap |

Alur terhubung: kontak, peluang, penawaran, pesanan, stok berkurang, faktur, pembayaran. Rencana v2 ada di [docs/roadmap.md](docs/roadmap.md).

## Stack

Next.js (App Router, Server Actions), TypeScript, PostgreSQL di Neon (dengan Row Level Security per toko), Drizzle ORM, Tailwind dan shadcn/ui, Zod. Hosting di Cloudflare Workers (OpenNext). Tes dengan Vitest dan Playwright, CI di GitHub Actions. Pembayaran lewat Midtrans.

Gambaran arsitektur: [docs/architecture.md](docs/architecture.md).

## Menjalankan secara lokal

Prasyarat: Node 24, pnpm 11, dan sebuah branch Neon untuk pengembangan.

1. `pnpm install`
2. Siapkan database dan `.env`: ikuti [docs/setup-neon.md](docs/setup-neon.md). Pemisahan role (`MIGRATION_URL` pemilik, `POSTGRES_URL` role `lapakin_app`) dijelaskan di [docs/tenancy.md](docs/tenancy.md).
3. `pnpm db:migrate`, lalu `pnpm db:seed` (membuat `test@test.com` / `admin123`, hanya untuk pengembangan).
4. `pnpm dev`, buka http://localhost:3000.

## Tes

- `pnpm test`: Vitest (logika bisnis dan integrasi ke database sungguhan; butuh `MIGRATION_URL` dan `POSTGRES_URL`).
- `pnpm test:e2e`: Playwright, alur utama di peramban terhadap dev server lokal (port 3100). Tes membuat toko uji sendiri dan menghapusnya sesudahnya. Pertama kali: `pnpm exec playwright install chromium`; tanpa mengunduh Chromium: `E2E_CHANNEL=msedge pnpm test:e2e`.
- CI: GitHub Actions menjalankan typecheck, migrasi, Vitest, dan Playwright pada setiap PR; penyiapannya di [docs/ci.md](docs/ci.md). `main` dilindungi: perubahan lewat PR dan `test` serta `e2e` harus lulus.

## Rilis dan operasional

- Deploy ke Cloudflare, urutan rilis dengan migrasi, dan catatan rilis per modul: [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).
- Pendaftaran Midtrans dan dokumen pendukungnya: [docs/midtrans-onboarding.md](docs/midtrans-onboarding.md).

## Dokumen lain

| Dokumen | Isi |
|---|---|
| [Spesifikasi desain](docs/superpowers/specs/2026-10-25-lapakin-design.md) | Tujuan, arsitektur, roadmap, risiko |
| [docs/learning-path.md](docs/learning-path.md) | Jalur belajar per modul |
| [docs/architecture.md](docs/architecture.md) | Peta direktori, bentuk modul, multi-tenant, keputusan desain |
| [docs/roadmap.md](docs/roadmap.md) | v1 selesai, v2 dan v3 dicatat |
| [docs/sessions/backup-database.md](docs/sessions/backup-database.md) | Brief sesi khusus: backup database produksi |

## Lisensi

[AGPL-3.0](LICENSE). Pihak lain boleh memakai dan memodifikasi, tetapi bila menawarkannya sebagai layanan online, kode ubahannya wajib dibuka.

## Atribusi

Kode awal berasal dari [nextjs/saas-starter](https://github.com/nextjs/saas-starter) (MIT, hak cipta Vercel). Teks lisensinya ada di [licenses/nextjs-saas-starter-MIT.txt](licenses/nextjs-saas-starter-MIT.txt).
