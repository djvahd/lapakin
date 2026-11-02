# Brief sesi: backup database produksi

Dokumen ini adalah bekal untuk sesi kerja khusus. Baca seluruhnya sebelum mulai; ia sengaja berdiri sendiri.

## Tujuan

Data produksi Lapakin (kontak pelanggan, stok, faktur, pembayaran) bisa dipulihkan setelah kehilangan atau kerusakan, dengan prosedur yang **sudah diuji**, tanpa bergantung pada riwayat Neon yang pendek.

## Konteks

- Database: PostgreSQL di **Neon**, project `lapakin` (ID `old-rain-87991025`), region Singapore, **paket Free**. Branch: `production` (default, dipakai situs live), `dev` (pengembangan lokal), `ci` (GitHub Actions; tidak boleh kedaluwarsa).
- **History retention hanya 6 jam** (terlihat di dasbor Neon). Artinya point-in-time restore bawaan Neon hanya menjangkau 6 jam ke belakang. Ini masalah utama yang diselesaikan sesi ini.
- Dua role: `neondb_owner` (pemilik, melewati RLS) dan `lapakin_app` (dipakai aplikasi, tunduk RLS). Penjelasan: `docs/tenancy.md`. Skema dikelola migrasi Drizzle di `lib/db/migrations` (saat ini sampai `0010`).
- Isi database yang penting dicadangkan: semua tabel data tenant (`contacts`, `crm_*`, `inv_*`, `sales_*`, `bill_*`, `auto_*`, `sub_payments`, `activity_logs`) dan tabel kontrol (`users`, `teams`, `team_members`, `invitations`). Berisi **data pribadi** (nama, email, telepon, hash kata sandi) dan data transaksi.
- Repo `djvahd/lapakin` di GitHub; `main` dilindungi (wajib PR dan `test` + `e2e` hijau). `gh` sudah login sebagai `djvahd` dengan scope `repo` dan `workflow`. CI sudah ada di `.github/workflows/ci.yml` (pola secret `CI_*`, `concurrency`, Node 24, pnpm 11).
- Shell pemilik: Windows PowerShell. Dokumentasi memakai bahasa Indonesia.

## Opsi yang perlu dipilih (jelaskan trade-off, rekomendasikan satu)

1. **Upgrade retensi Neon** (berbayar): paling sederhana, tanpa kode, tetapi biaya bulanan dan tetap satu penyedia.
2. **`pg_dump` terjadwal lewat GitHub Actions**, disimpan sebagai artefak (maksimum 90 hari, privat) atau di penyimpanan objek (mis. Cloudflare R2 bila ada akun). Gratis atau murah; kode kecil.
3. Gabungan: dump harian ke luar Neon **dan** retensi bawaan.

Pertimbangkan: ukuran dump (saat ini kecil), enkripsi (data pribadi), siapa yang bisa mengunduh artefak, dan biaya.

## Rancangan awal yang disarankan (bila opsi 2)

- Workflow `.github/workflows/backup.yml`: `schedule` harian (mis. 20:00 UTC = 03:00 WIB) dan `workflow_dispatch`. Menjalankan `pg_dump` (format custom, `--no-owner --no-privileges`) dari branch `production`, mengenkripsi (mis. `age` dengan kunci publik; kunci privat disimpan pemilik di luar GitHub), lalu mengunggah artefak dengan retensi 14 sampai 30 hari. Notifikasi bila gagal (workflow merah sudah cukup; pertimbangkan email GitHub).
- Kredensial: **role baca-saja** khusus backup di branch `production` (buat dengan SQL: `CREATE ROLE backup_ro LOGIN PASSWORD ...; GRANT CONNECT ...; GRANT USAGE ON SCHEMA public; GRANT SELECT ON ALL TABLES IN SCHEMA public; ALTER DEFAULT PRIVILEGES ... GRANT SELECT ...`). Perhatikan: RLS aktif, jadi role itu harus punya `BYPASSRLS` atau dump dibuat oleh pemilik. Pilih dan jelaskan alasannya. Secret GitHub: `BACKUP_DATABASE_URL`, `BACKUP_AGE_PUBLIC_KEY`.
- Panduan pemulihan `docs/backup-restore.md` dalam PowerShell: mengunduh artefak, mendekripsi, memulihkan ke **branch Neon kosong** (`pg_restore`), memeriksa jumlah baris, lalu cara mengganti produksi bila perlu (rotasi `POSTGRES_URL`).
- **Uji pemulihan sungguhan** ke branch kosong dan catat hasilnya (jumlah baris per tabel cocok dengan produksi, aplikasi bisa tersambung ke hasil pulihnya). Backup yang belum pernah dipulihkan belum bisa dianggap ada.
- Cek berkala otomatis: langkah di workflow yang memeriksa dump tidak kosong dan ukurannya wajar.

## Batasan dan aturan kerja

- **Jangan menulis ke produksi** (jalankan hanya perintah baca) tanpa izin eksplisit pemilik. Pembuatan role dan secret dilakukan **pemilik**; sesi ini menyiapkan perintah persisnya.
- Jangan menempelkan connection string ke chat, commit, atau log. Gunakan prompt tersembunyi dan berkas sementara di luar repo (pola yang dipakai untuk secret CI), lalu hapus.
- Perubahan lewat branch dan PR kecil; CI harus hijau sebelum merge (aturan GitHub workflow pemilik). Tanpa atribusi Claude di commit atau PR.
- Jangan membuat branch Neon baru tanpa pemilik (Neon tidak bisa diakses dari sesi ini tanpa kredensial); minta pemilik membuatnya, atau minta API key hanya bila pemilik memilih begitu.
- Jangan menyentuh branch `ci` selain yang diperlukan, dan pastikan branch uji pemulihan **tidak kedaluwarsa otomatis** bila masih dibutuhkan (atau hapus setelah selesai).

## Kriteria selesai

1. Keputusan opsi tercatat beserta alasannya.
2. Backup otomatis berjalan dan terbukti menghasilkan berkas terenkripsi yang bisa diunduh.
3. `docs/backup-restore.md` ada, dan satu uji pemulihan sungguhan sudah dijalankan dengan hasil tercatat.
4. Pemilik tahu: di mana backup disimpan, berapa lama, siapa yang bisa membukanya, dan langkah pemulihan dalam satu halaman.
5. `README.md` dan `docs/deploy-cloudflare.md` menautkan ke panduan itu; item "backup database" dicoret dari daftar pekerjaan di luar modul.

## Pertanyaan untuk pemilik di awal sesi

- Mau biaya nol (opsi 2) atau boleh bayar untuk retensi lebih panjang (opsi 1)?
- Punya akun Cloudflare R2 atau penyimpanan lain? Atau cukup artefak GitHub (90 hari)?
- Siapa yang memegang kunci dekripsi, dan di mana disimpannya (pengelola kata sandi)?
- Seberapa lama data harus bisa dipulihkan ke belakang (14, 30, 90 hari)?
