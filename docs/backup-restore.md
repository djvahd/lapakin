# Backup dan pemulihan database

Neon paket Free hanya menyimpan riwayat 6 jam, jadi point-in-time restore bawaan tidak cukup. Backup harian ke luar Neon dibuat oleh `.github/workflows/backup.yml`.

## Ringkasan (satu halaman)

| Pertanyaan | Jawaban |
|---|---|
| Keputusan | Opsi 2: `pg_dump` terjadwal lewat GitHub Actions, biaya nol. Dipilih karena Neon Free tidak berbayar dan datanya kecil. |
| Di mana | Artefak Actions `lapakin-db-backup` di repo `djvahd/lapakin` |
| Berapa lama | 30 hari (`retention-days: 30`), satu berkas per hari |
| Jadwal | Setiap hari 20:00 UTC (03:00 WIB), dan manual lewat tab Actions, Run workflow |
| Siapa bisa membuka | Siapa pun dengan akses baca repo bisa mengunduh artefak, tetapi isinya terenkripsi `age`; hanya pemegang kunci privat yang bisa membukanya. Kunci privat: pemilik, di pengelola kata sandi |
| Gagal | Run merah dan email GitHub. Dump di bawah 10 KB atau tanpa tabel inti juga dianggap gagal |

Catatan: bila repo publik dan tidak ada aktivitas 60 hari, GitHub menonaktifkan workflow terjadwal. Cek tab Actions sesekali.

## Penyiapan (sekali, oleh pemilik)

Semua perintah di PowerShell. Jangan menempelkan connection string ke chat, commit, atau log.

### 1. Kunci enkripsi

```powershell
winget install FiloSottile.age
age-keygen -o $env:USERPROFILE\lapakin-backup.key
```

Simpan **seluruh isi** berkas itu di pengelola kata sandi, lalu hapus dari disk bila mau. Tanpa kunci ini backup tidak bisa dibuka. Baris `# public key: age1...` adalah kunci publik.

```powershell
gh secret set BACKUP_AGE_PUBLIC_KEY --repo djvahd/lapakin
```

Tempel kunci publik (`age1...`) saat diminta.

### 2. Role baca-saja di produksi

Jalankan sebagai `neondb_owner` pada branch `production` (SQL Editor Neon). RLS aktif, jadi role backup memakai `BYPASSRLS`; tanpa itu dump hanya berisi baris kosong. Ganti `GANTI_PASSWORD` dengan sandi acak panjang.

```sql
CREATE ROLE backup_ro LOGIN BYPASSRLS PASSWORD 'GANTI_PASSWORD';
GRANT pg_read_all_data TO backup_ro;
```

`pg_read_all_data` memberi SELECT ke semua tabel, termasuk tabel baru di masa depan, jadi tidak perlu `ALTER DEFAULT PRIVILEGES`. Bila Neon menolak `BYPASSRLS` lewat SQL, buat role lewat konsol Neon (Roles, New Role) lalu jalankan `GRANT` saja.

### 3. Secret koneksi

Pakai connection string **langsung** (host tanpa `-pooler`) untuk `backup_ro`, database `neondb`:

```powershell
gh secret set BACKUP_DATABASE_URL --repo djvahd/lapakin
```

Tempel URL saat diminta. Lalu jalankan: `gh workflow run backup.yml --repo djvahd/lapakin` dan pastikan run hijau serta artefaknya ada.

## Memulihkan

### 1. Unduh dan dekripsi

```powershell
mkdir $env:TEMP\restore; cd $env:TEMP\restore
gh run list --workflow backup.yml --repo djvahd/lapakin --limit 5
gh run download <RUN_ID> --repo djvahd/lapakin --name lapakin-db-backup
age -d -i $env:USERPROFILE\lapakin-backup.key -o db.dump lapakin-YYYYMMDD.dump.age
```

Bila kunci ada di pengelola kata sandi, simpan ke berkas sementara dulu dan hapus setelah selesai. `pg_restore` ada di paket `postgresql-client` (Windows: `winget install PostgreSQL.PostgreSQL.17`, cukup alat klien).

### 2. Pulihkan ke branch Neon kosong

Minta/buat branch baru di Neon (mis. `restore-test`) dari `production`. Role ikut tersalin; datanya tidak dipakai karena kita memulihkan ke database terpisah:

```sql
CREATE DATABASE restore_test OWNER neondb_owner;
```

```powershell
$env:RESTORE_URL = Read-Host "URL neondb_owner branch restore-test, database restore_test"
pg_restore --no-owner --no-privileges --dbname=$env:RESTORE_URL db.dump
```

Hak `lapakin_app` tidak ikut di dump (`--no-privileges`). Berikan lagi sebagai pemilik:

```sql
GRANT USAGE ON SCHEMA public TO lapakin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lapakin_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lapakin_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lapakin_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lapakin_app;
```

### 3. Periksa

Bandingkan jumlah baris dengan produksi (baca saja) pada tabel penting:

```sql
SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'teams', count(*) FROM teams
UNION ALL SELECT 'contacts', count(*) FROM contacts UNION ALL SELECT 'activity_logs', count(*) FROM activity_logs;
```

Lalu jalankan aplikasi lokal dengan `POSTGRES_URL` (sebagai `lapakin_app`) dan `MIGRATION_URL` menunjuk ke database pulihan, masuk, dan cek dashboard. Jumlah baris boleh sedikit di bawah produksi (dump diambil di masa lalu); selisih besar berarti ada masalah.

### 4. Mengganti produksi (bila benar-benar perlu)

1. Catat alasan dan jam kerusakan. Hentikan penulisan bila bisa.
2. Pulihkan ke branch baru seperti di atas, atur password `lapakin_app` di sana.
3. Ganti secret `POSTGRES_URL` dan `MIGRATION_URL` di Worker dan GitHub ke branch hasil pulihan: `pnpm exec wrangler secret put POSTGRES_URL`. Urutan dan caranya sama dengan `docs/tenancy.md`.
4. Jadikan branch itu default di Neon atau perbarui `CI_*` bila perlu. Simpan branch lama sampai yakin.

Setelah uji selesai, hapus branch `restore-test` (atau pastikan tidak kedaluwarsa bila masih dipakai).

## Catatan hasil uji pemulihan

| Tanggal | Artefak | Hasil |
|---|---|---|
| (belum dijalankan) | | |

Backup yang belum pernah dipulihkan belum bisa dianggap ada. Isi tabel ini setelah uji pertama.
