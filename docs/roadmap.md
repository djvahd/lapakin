# Roadmap

Sumber: [spesifikasi desain](superpowers/specs/2026-10-25-lapakin-design.md), bagian 5. Dicatat ulang di sini dengan status terbaru.

## v1 (selesai)

Inti (multi-tenant, auth, audit), Kontak, CRM, Produk dan Inventory, Sales, Invoicing, mesin otomasi dengan pengingat, langganan Midtrans, situs publik, CI dan E2E.

Yang masih menunggu di luar kode: persetujuan akun Midtrans lalu uji sandbox; backup database ([sessions/backup-database.md](sessions/backup-database.md)).

## v2 (dicatat, belum dimulai)

Purchase, Accounting dasar, Expenses, Laporan, eCommerce ringan (template halaman), POS Shop (lewat gateway berizin), Email Marketing, WhatsApp (pihak ketiga).

**Keputusan pemilik (2 November 2026): v2 menunggu pengguna nyata.** Mana yang dikerjakan lebih dulu ditentukan oleh apa yang diminta pengguna v1, bukan oleh urutan di atas. Kandidat yang paling mungkin berguna lebih dulu karena memakai data v1 yang sudah ada:

- **Laporan:** penjualan per periode, piutang menurut umur, stok dan nilai persediaan, kinerja pipeline CRM.
- **Purchase:** pesanan pembelian ke pemasok, penerimaan barang yang menambah stok (mutasi `receipt` sudah ada).
- **Expenses** dan **Accounting dasar:** pencatatan manajerial (bagan akun SAK EMKM); minta telaah akuntan sebelum dijual.

## v3 (berurutan sesuai permintaan pelanggan)

Project, Timesheets, Employees, Time Off, Helpdesk, Appointments, Subscriptions, Rental, Documents, Knowledge, Discuss, Live Chat, Surveys, Events, Manufacturing sederhana, Marketing Automation, Payroll bertahap, Recruitment, Appraisals, Maintenance, Fleet.

## Tidak dikerjakan

Sign, Website Builder, PLM, Quality, IoT, VoIP, AI, ESG, Spreadsheet. Ditunda: Social Marketing, POS Restaurant.

## Catatan teknis yang tertunda

- Pembatasan fitur Free dan Pro baru mencakup jumlah pengguna dan otomasi.
- Refund dan chargeback Midtrans diabaikan webhook dan ditangani manual.
- Aksi otomasi baru selain `notify` (email, WhatsApp) belum ada; tambahkan di `modules/automation/handlers.ts`.
- Pemindai cron harian menelusuri semua toko; perlu dipikir ulang bila jumlah toko besar.
- Peristiwa "paket sudah berakhir" belum ada (pemindai berhenti saat paket habis).
