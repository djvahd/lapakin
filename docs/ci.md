# CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`. Berjalan pada setiap pull request dan push ke `main`.

| Job | Isi |
|---|---|
| `test` | `pnpm install --frozen-lockfile`, typecheck (`tsc --noEmit`), `pnpm db:migrate` ke database CI, lalu `pnpm test` (Vitest) |
| `e2e` | Menunggu `test`, memasang Chromium, lalu `pnpm test:e2e` (Playwright). Bila gagal, trace dan screenshot diunggah sebagai artefak `playwright-results` |

PR dari fork dilewati karena GitHub tidak memberi secret ke fork, sedangkan tes membutuhkan database.

## Database CI

Tes menulis data uji ke database sungguhan dan membersihkannya sendiri, jadi **pakai branch Neon khusus CI**, jangan `production` dan sebaiknya bukan `dev` yang Anda pakai sehari-hari (tes lokal dan CI bisa saling bertabrakan). Run CI diserialkan (`concurrency: ci-database`) agar dua run tidak memakai database yang sama bersamaan.

Siapkan sekali:

1. Di Neon, buat branch `ci` dari `dev`.
2. Atur password role aplikasi `lapakin_app` di branch itu. Dari folder proyek, dengan `MIGRATION_URL` (variabel shell, bukan `.env`) menunjuk ke URL **owner** branch `ci`, jalankan `node scripts/set-app-role-password.mjs --print`. Tanpa `--print` skrip menolak jalan (agar `.env` dev tidak tertimpa). URL `lapakin_app` yang tercetak adalah isi `CI_POSTGRES_URL`. Langkah lengkap dengan PowerShell ada di [docs/ci-setup-walkthrough.md](ci-setup-walkthrough.md).
3. Tambahkan tiga secret di GitHub (Settings, Secrets and variables, Actions, New repository secret):

| Secret | Isi |
|---|---|
| `CI_MIGRATION_URL` | Connection string **owner** branch `ci` (direct, bukan pooled) |
| `CI_POSTGRES_URL` | Connection string role `lapakin_app` branch `ci` |
| `CI_AUTH_SECRET` | String acak (`openssl rand -base64 32`), tidak perlu sama dengan produksi |

Lewat CLI (nilai diketik di prompt, tidak masuk riwayat shell):

```bash
gh secret set CI_MIGRATION_URL
gh secret set CI_POSTGRES_URL
gh secret set CI_AUTH_SECRET
```

## Branch protection

Setelah CI hijau pertama kali, wajibkan `test` dan `e2e` lulus sebelum merge: Settings, Branches, aturan untuk `main`, "Require status checks to pass", pilih kedua job.

## Catatan

- Migrasi baru diterapkan ke database CI oleh langkah `pnpm db:migrate` sebelum tes, jadi PR yang menambah migrasi diuji terhadap skema barunya.
- Tes yang menyentuh Midtrans memakai `fetch` palsu; tidak ada kunci Midtrans di CI.
- Satu ulangan otomatis di E2E (`retries: 1` saat `CI` diset) menyerap putus koneksi sesaat ke Neon; tes Vitest tidak diulang.
