# Arsitektur

Modular monolith: satu codebase Next.js, satu database PostgreSQL. Modul memisahkan kode dan tabel per domain, tetapi berjalan dalam satu proses.

## Peta direktori

```
app/                    Rute tipis (App Router): halaman server, route handler API
  (dashboard)/          Halaman publik (landing, pricing, hukum) dan dashboard
  (login)/              Masuk, daftar, dan aksi akun
  api/                  cron, midtrans (webhook), notifications, team, user
components/             Komponen UI bersama (shadcn) dan footer/halaman hukum
lib/
  db/                   Skema inti, drizzle, withTenant, queries kontrol, migrasi
  auth/                 Sesi, middleware aksi, konteks tenant, izin per role
  payments/             Midtrans, paket, langganan
  audit.ts              Penulisan audit log
modules/<modul>/        Satu folder per domain (lihat di bawah)
worker.ts               Entri Cloudflare Worker (fetch + scheduled)
scripts/                Skrip operasional (migrasi status, role, dokumen Midtrans)
tests/                  Vitest (unit dan integrasi ke database)
e2e/                    Playwright
```

## Bentuk sebuah modul

Modul: `contacts`, `crm`, `inventory`, `sales`, `billing`, `automation`. Berkas yang sama di setiap modul:

| Berkas | Peran |
|---|---|
| `schema.ts` | Tabel Drizzle, kunci asing komposit, constraint, RLS |
| `schemas.ts` | Skema Zod untuk input |
| `service.ts` | Logika bisnis dan akses data; satu-satunya tempat query modul |
| `form.ts` | Penerjemah `FormData` / query string ke skema Zod (murni, mudah dites) |
| `actions.ts` | Server Action: izin, parsing form, panggil service, `revalidatePath` |
| `audit-labels.ts` | Teks audit log untuk aksi modul |
| `ui/` | Komponen klien khusus modul |

Aturan: antar modul hanya lewat fungsi publik `service.ts` (mis. Sales memanggil `inventory.recordMovement`, Faktur memanggil `sales.getOrder`), tidak membaca tabel modul lain. Halaman di `app/` tipis: ambil konteks, panggil service, render.

## Multi-tenant

Tenant = toko (`teams`). Semua tabel data punya `team_id`, dengan dua lapis isolasi:

1. **Eksplisit:** setiap query memfilter `team_id` dari konteks sesi.
2. **Row Level Security:** policy `tenant_isolation` per tabel; `withTenant(teamId, [...queries])` menyetel `app.team_id` dalam satu transaksi batch. Aplikasi tersambung sebagai role `lapakin_app` (tanpa `BYPASSRLS`); migrasi memakai pemilik.

Kunci asing komposit `(id, team_id)` mencegah baris satu toko menunjuk baris toko lain. Detail dan prosedur produksi: [tenancy.md](tenancy.md).

Driver database memakai HTTP (`@neondatabase/serverless`) karena `workerd` tidak mendukung driver Postgres biasa. Konsekuensinya tidak ada transaksi interaktif: atomisitas dicapai lewat `db.batch`, pernyataan SQL tunggal (CTE), dan penguncian baris (`SELECT ... FOR UPDATE`) di dalam batch yang sama.

## Alur permintaan

- **Baca:** halaman server memanggil `getTenantContext()` (sesi, toko aktif, role), lalu service dengan `teamId`.
- **Tulis:** form memanggil Server Action yang dibungkus `validatedActionWithTenant(skema, izin, handler)`: mengambil konteks, memeriksa izin role dari database (bukan dari UI), lalu menjalankan handler. Galat bisnis berupa kelas galat modul (mis. `InventoryError`) yang diubah menjadi pesan di form.
- **Izin:** `lib/auth/permissions.ts`, peta izin ke role (`owner`, `member`). Fitur berbayar diperiksa di service lewat `getSubscription`.

## Keputusan desain penting

- **Stok dari buku besar.** `inv_stock_movements` hanya bertambah (hak `UPDATE`/`DELETE` dicabut). Stok = jumlah mutasi bertanda. Mutasi keluar disisipkan bersyarat setelah mengunci varian, jadi stok tidak bisa minus walau permintaan bersamaan.
- **Stok berkurang saat pengiriman**, bukan saat pesanan dikonfirmasi. Bila mutasi gagal di tengah pengiriman, pengiriman dibatalkan dan mutasi yang sudah ada dikembalikan dengan mutasi retur.
- **Penawaran dan pesanan satu dokumen** (`sales_orders`) dengan status, seperti `sale.order` di Odoo.
- **Faktur menyalin baris pesanan** dan boleh sebagian; sisa tagihan dan status bayar dihitung dari pembayaran, tidak disimpan. Pembayaran hanya bertambah dan disisipkan bersyarat agar tidak melebihi sisa.
- **Nomor dokumen** (S0001, F0001) berurut per toko lewat indeks unik dan ulangan saat tabrakan.
- **Audit log** ditulis dalam batch yang sama dengan perubahan datanya.
- **Mesin otomasi:** `emit(toko, peristiwa, payload)` menjalankan aturan aktif yang cocok; tiap eksekusi dicatat; `dedupeKey` + indeks unik membuat aksi yang sama tidak berjalan dua kali. Aksi awal `notify` (notifikasi dalam aplikasi). Peristiwa berbasis waktu dibuat oleh pemindai harian.
- **Langganan:** bayar per periode lewat Midtrans Snap; webhook memverifikasi tanda tangan SHA512 dan jumlah, lalu memperpanjang `teams.plan_expires_at` dalam satu pernyataan SQL yang idempoten. Free: satu pengguna, tanpa otomasi; Pro: tanpa batas.

## Hosting dan operasional

- **Cloudflare Workers** lewat OpenNext. `worker.ts` membungkus worker hasil build dan menambah handler `scheduled`; cron harian (01:00 UTC) memanggil `POST /api/cron/automation` yang dijaga `CRON_SECRET`.
- **Rahasia** hanya lewat `wrangler secret put`: `POSTGRES_URL` (role `lapakin_app`), `AUTH_SECRET`, `BASE_URL`, `CRON_SECRET`, `MIDTRANS_SERVER_KEY`.
- **Migrasi** dibuat dengan `drizzle-kit generate` dan hanya menambah, kecuali yang sengaja destruktif (ditandai di berkasnya). Urutan rilis normal: migrasi, lalu deploy kode. Kode lama harus tetap jalan di skema baru. Rincian: [deploy-cloudflare.md](deploy-cloudflare.md).
- **CI:** [ci.md](ci.md).

## Pengujian

- **Vitest:** logika bisnis dan integrasi ke database sungguhan sebagai role `lapakin_app` (termasuk isolasi antar toko, konkurensi stok dan pembayaran, dedupe otomasi). Tes membuat toko sendiri dan membersihkannya.
- **Playwright:** alur utama di peramban (penjualan sampai pembayaran, CRM sampai penawaran, stok, otomasi, halaman harga dan publik) terhadap toko uji terisolasi.
