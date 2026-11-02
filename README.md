# lapakin

ERP + CRM modular untuk usaha kecil-menengah (jasa dan perdagangan). Mengadaptasi layanan-layanan Odoo versi ringan: kontak, CRM, inventori, penjualan, dan faktur, lalu bertahap ke modul lain.

> Status: tahap desain. Belum ada kode aplikasi. Lihat [dokumen desain](docs/superpowers/specs/2026-10-25-lapakin-design.md) dan [jalur belajar](docs/learning-path.md).

## Stack

Next.js (App Router), TypeScript, PostgreSQL (Neon), Drizzle ORM, shadcn/ui, Tailwind, Zod, Vitest, Playwright. Hosting: Cloudflare Workers + Neon. Pembayaran: Midtrans atau Xendit.

Fondasi: fork dari [nextjs/saas-starter](https://github.com/nextjs/saas-starter) (MIT).

## Tes

- `pnpm test`: Vitest (logika bisnis dan integrasi database, butuh `MIGRATION_URL` dan `POSTGRES_URL` di `.env`).
- `pnpm test:e2e`: Playwright, alur utama di peramban terhadap dev server lokal (port 3100) dan database dev. Tes membuat toko uji sendiri dan menghapusnya sesudahnya. Pertama kali: `pnpm exec playwright install chromium`. Tanpa mengunduh Chromium, pakai peramban terpasang: `E2E_CHANNEL=msedge pnpm test:e2e` (atau `chrome`).
- CI: GitHub Actions menjalankan typecheck, Vitest, dan Playwright pada setiap PR; penyiapan secret dan database CI ada di [docs/ci.md](docs/ci.md).

## Lisensi

[AGPL-3.0](LICENSE). Pihak lain boleh memakai dan memodifikasi, tetapi bila menawarkannya sebagai layanan online, kode ubahannya wajib dibuka.

## Atribusi

Kode awal berasal dari [nextjs/saas-starter](https://github.com/nextjs/saas-starter) (MIT, hak cipta Vercel). Teks lisensinya ada di [licenses/nextjs-saas-starter-MIT.txt](licenses/nextjs-saas-starter-MIT.txt).
