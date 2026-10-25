# lapakin: dokumen desain

Tanggal: 2026-10-25. Status: disetujui pemilik proyek.

## 1. Tujuan

ERP + CRM modular untuk usaha kecil-menengah di bidang jasa dan perdagangan, mengadaptasi konsep layanan Odoo versi ringan. Dipasarkan untuk mendapatkan klien, sekaligus menjadi portofolio. Repo publik berlisensi AGPL-3.0.

Odoo hanya menjadi acuan konsep dan skema data. Kodenya tidak disalin (LGPL, Python).

## 2. Keputusan teknis

| Aspek | Keputusan |
|---|---|
| Fondasi | Fork `nextjs/saas-starter` (MIT) |
| Framework | Next.js App Router, TypeScript |
| Database | PostgreSQL di Neon (region Singapura), Drizzle ORM |
| UI dan validasi | shadcn/ui, Tailwind, Zod |
| Tes | Vitest (logika bisnis), Playwright (alur utama), tes isolasi antar tenant |
| Hosting | Cloudflare Workers lewat OpenNext + Neon. Kompatibilitas library dan batas bundle diverifikasi saat setup |
| Pembayaran | Midtrans atau Xendit. Sistem tidak memproses atau menyimpan dana sendiri |
| Lisensi | AGPL-3.0 |
| Alur kerja | Issue, branch, PR (`Closes #n`), review, merge. Tanpa atribusi Claude di commit |

Perubahan dari starter: Stripe diganti Midtrans/Xendit, dependensi di-upgrade, penyesuaian agar berjalan di Cloudflare Workers (hashing password, driver Postgres, pembuatan PDF dengan library ringan seperti `pdf-lib`).

## 3. Arsitektur

Modular monolith: satu codebase, satu database.

```
src/
  core/         auth, tenant, role, billing, audit log, notifikasi, mesin otomasi
  modules/
    contacts/
    crm/
    inventory/  (produk, varian, mutasi stok)
    sales/
    invoicing/
  app/          route dan halaman tipis, memanggil modul
```

Aturan:
- Modul boleh memakai `core`. Antar modul hanya lewat fungsi publik (contoh: `sales` memanggil `inventory.reserve()`), tidak membaca tabel modul lain.
- Multi-tenant: setiap tabel memiliki `tenant_id`, dengan Row Level Security PostgreSQL sebagai lapis kedua.
- Stok dihitung dari `stock_movements`, bukan satu angka, sehingga ada jejak audit. Penguncian transaksi mencegah stok minus.
- Mesin otomasi kecil di `core` (pemicu, kondisi, aksi) dipakai untuk pengingat tagih dan tindak lanjut CRM, dan menjadi dasar Marketing Automation di v3.

## 4. Data dan alur v1

- Inti: `tenants`, `users`, `memberships` (role), `subscriptions`, `audit_log`.
- Kontak: perusahaan dan orang, pelanggan dan pemasok, tag.
- CRM: peluang, tahap pipeline, aktivitas.
- Inventory: `products`, `variants`, `stock_movements`.
- Sales: penawaran, pesanan penjualan, pengiriman.
- Invoicing: faktur, `payments` (bayar sebagian), piutang, pengingat tagih.

Alur terhubung: kontak, peluang, penawaran, pesanan, stok berkurang, faktur, pembayaran.

## 5. Roadmap

**v1 (perkiraan 3 sampai 3,5 bulan):** Inti, Kontak, CRM, Produk + Inventory, Sales, Invoicing.

**v2:** Purchase, Accounting dasar, Expenses, Laporan, eCommerce ringan (template halaman), POS Shop (lewat gateway berizin), Email Marketing, WhatsApp (pihak ketiga).

**v3 (berurutan sesuai permintaan pelanggan):** Project, Timesheets, Employees, Time Off, Helpdesk, Appointments, Subscriptions, Rental, Documents, Knowledge, Discuss, Live Chat, Surveys, Events, Manufacturing sederhana, Marketing Automation, Payroll bertahap (mulai slip gaji), Recruitment, Appraisals, Maintenance, Fleet.

**Tidak dikerjakan:** Sign, Website Builder, PLM, Quality, IoT, VoIP, AI, ESG, Spreadsheet. **Ditunda:** Social Marketing, POS Restaurant.

## 6. Risiko hukum dan data (bukan nasihat hukum)

- **Payroll:** tarif PPh 21, BPJS, dan UMR disimpan sebagai data berlaku-mulai-tanggal. Tahap awal hanya slip gaji tanpa hitung pajak. Hitung pajak ditambah kemudian, diuji dengan contoh resmi dan ditelaah akuntan. Syarat layanan menyatakan ini alat bantu hitung.
- **Accounting:** pencatatan manajerial (bagan akun SAK EMKM, jurnal, laba rugi, neraca). Tanpa pelaporan pajak resmi. Integrasi e-Faktur/Coretax lewat ekspor data. Bagan akun ditelaah akuntan.
- **HR dan UU PDP:** enkripsi per kolom untuk data sensitif (NIK, rekening), akses berbasis role dan RLS, audit log, pengumpulan data seminimal mungkin, ekspor dan hapus data atas permintaan, prosedur pemberitahuan insiden, kebijakan privasi, dan perjanjian pemrosesan data dengan pelanggan.
- **Pembayaran:** selalu lewat gateway berizin.
- Sebelum modul pajak dan data karyawan dijual, minta telaah akuntan dan konsultan hukum.

## 7. Pekerjaan di luar modul

Port starter; tes isolasi tenant dan CI GitHub Actions; halaman Syarat dan Privasi; backup database; README dan dokumentasi arsitektur; demo online; landing page dan paket gratis terbatas.

## 8. Di luar cakupan versi ini

Rincian skema tabel, desain UI, dan rencana implementasi per modul ditulis terpisah saat tiap modul dikerjakan.
