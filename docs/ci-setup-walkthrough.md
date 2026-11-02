# Panduan: menyiapkan database dan secret CI (PowerShell)

Tujuan: membuat database khusus CI di Neon dan memasang tiga secret GitHub supaya workflow `.github/workflows/ci.yml` bisa menjalankan tes. Semua perintah dijalankan di **Windows PowerShell** dari folder proyek (`D:\4_Project\lapakin`). Waktu yang dibutuhkan: sekitar 10 menit.

Aturan yang berlaku di seluruh panduan: **jangan menempelkan connection string ke chat, issue, atau commit.** Nilainya diketik di prompt tersembunyi.

## Gambaran

| Secret GitHub | Isi | Asal |
|---|---|---|
| `CI_MIGRATION_URL` | URL role **pemilik** (`neondb_owner`) branch `ci`, direct | Dasbor Neon |
| `CI_POSTGRES_URL` | URL role **`lapakin_app`** branch `ci` | Dicetak skrip pada langkah 3 |
| `CI_AUTH_SECRET` | String acak | Dibuat pada langkah 4 |

Kenapa dua URL berbeda: aplikasi harus tersambung sebagai `lapakin_app` agar row level security berlaku, sedangkan migrasi dan penyiapan data uji memakai pemilik database (lihat `docs/tenancy.md`).

## Langkah 0. Prasyarat

```powershell
gh auth status
pnpm -v
```

`gh` harus sudah login ke akun yang memiliki repo `djvahd/lapakin` dan punya izin mengelola secret (peran admin). Kalau belum login: `gh auth login`.

## Langkah 1. Buat branch Neon `ci`

1. Buka https://console.neon.tech, pilih project `lapakin`.
2. Menu **Branches**, **Create branch**.
3. Nama `ci`, parent branch `dev`, sumber data **Current data**. Klik **Create**.

Kenapa dari `dev`: branch baru langsung berisi skema yang sudah termigrasi dan role `lapakin_app`. Jangan memakai `production`, dan jangan memakai `dev` itu sendiri karena tes lokal dan CI akan saling bertabrakan.

## Langkah 2. Ambil URL pemilik branch `ci`

1. Di dasbor, pilih branch **`ci`** (bukan `dev`), klik **Connect**.
2. Pilih role **`neondb_owner`**, database `neondb`.
3. **Matikan** "Connection pooling" (agar jadi *direct connection*).
4. Salin connection string. Bentuknya `postgresql://neondb_owner:...@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`. Simpan di clipboard; jangan ditulis ke berkas.

Pastikan host-nya milik branch `ci`: setiap branch punya endpoint (`ep-...`) sendiri. Kalau URL-nya sama dengan yang ada di `.env` (dev), itu branch yang salah.

## Langkah 3. Atur password `lapakin_app` di branch `ci` dan ambil URL-nya

Role `lapakin_app` di branch `ci` ikut tersalin dari `dev` dengan password yang sama. Untuk CI kita beri password baru.

```powershell
$sec = Read-Host "URL owner branch CI (direct)" -AsSecureString
$env:MIGRATION_URL = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
node scripts/set-app-role-password.mjs --print
```

Tempel URL dari langkah 2 saat diminta (layar tidak menampilkan apa pun). Skrip akan:
1. menjalankan `ALTER ROLE lapakin_app PASSWORD '<acak>'` di branch `ci`, lalu
2. **mencetak** URL `lapakin_app` di terminal, bentuknya `postgresql://lapakin_app:<acak>@ep-xxxx...`.

**`--print` wajib.** Tanpa itu skrip menolak karena `MIGRATION_URL` datang dari variabel shell (supaya `.env` dev tidak tertimpa).

Salin URL yang tercetak itu ke clipboard: itulah nilai `CI_POSTGRES_URL`. Setelah itu bersihkan:

```powershell
Remove-Item Env:MIGRATION_URL
Clear-Host
```

### Pemeriksaan keamanan: dev tidak boleh rusak

Role Postgres di Neon disalin per branch, jadi password baru ini seharusnya hanya berlaku di `ci`. Pastikan `dev` tidak ikut berubah:

```powershell
pnpm exec vitest run tests/contacts.test.ts
```

Kalau lulus, `.env` dev kamu masih bisa login sebagai `lapakin_app`. Kalau gagal dengan `password authentication failed`, passwordnya ternyata dipakai bersama: jalankan `node scripts/set-app-role-password.mjs` (tanpa `--print`, dengan `MIGRATION_URL` dev di `.env`) untuk memulihkan `.env` dev, lalu kabari saya.

## Langkah 4. Pasang tiga secret ke GitHub

`gh secret set` meminta nilainya lewat prompt tersembunyi, jadi tidak tersimpan di riwayat PowerShell.

```powershell
gh secret set CI_MIGRATION_URL
```
Tempel URL pemilik branch `ci` (langkah 2), tekan Enter.

```powershell
gh secret set CI_POSTGRES_URL
```
Tempel URL `lapakin_app` (langkah 3), tekan Enter.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" | Set-Clipboard
gh secret set CI_AUTH_SECRET
```
Baris pertama membuat string acak dan langsung menaruhnya di clipboard; tempel di prompt kedua. Nilai ini tidak perlu sama dengan produksi.

Kalau `gh secret set` menjawab `403` atau `Resource not accessible`, akunmu belum punya izin admin atas repo. Alternatif lewat web: https://github.com/djvahd/lapakin/settings/secrets/actions, **New repository secret**, isi nama dan nilainya.

## Langkah 5. Periksa

```powershell
gh secret list
```

Harus tampil tiga nama: `CI_AUTH_SECRET`, `CI_MIGRATION_URL`, `CI_POSTGRES_URL` (nilainya memang tidak ditampilkan).

## Langkah 6. Jalankan ulang CI

```powershell
gh run list --branch ci/github-actions --limit 1
gh run rerun <id-run> --failed
gh run watch <id-run>
```

Run kini melewati "Check secrets", lalu menjalankan install, typecheck, migrasi, Vitest, dan Playwright. Waktu yang wajar: sekitar 5 sampai 10 menit.

## Kalau ada yang gagal

| Gejala | Kemungkinan penyebab |
|---|---|
| `Check secrets` masih merah | Nama secret salah ketik. Cocokkan dengan tabel di atas, persis. |
| `pnpm db:migrate` gagal `password authentication failed` | `CI_MIGRATION_URL` salah role atau salah branch (harus pemilik, branch `ci`). |
| Vitest gagal `permission denied for table` | `CI_POSTGRES_URL` memakai role yang salah, atau role `lapakin_app` tidak ikut tersalin. Ulangi langkah 3. |
| Banyak tes gagal `relation ... does not exist` | `db:migrate` tidak jalan atau menunjuk branch lain. Cek log langkah "Apply migrations". |
| Playwright gagal di langkah install browser | Gangguan jaringan runner; jalankan ulang run sekali. |
| Satu-dua tes gagal `fetch failed` | Putus koneksi sesaat ke Neon (E2E sudah punya satu ulangan otomatis; Vitest tidak). Jalankan ulang. |

Tempel potongan log yang merah (tanpa URL) bila perlu bantuan.

## Setelah hijau

1. Merge PR #52.
2. Aktifkan branch protection: Settings, Branches, aturan untuk `main`, **Require status checks to pass**, pilih `test` dan `e2e`.
3. Tutup issue #39.
