# Setup database Neon (Issue #11)

Database memakai PostgreSQL di Neon. Branch `main` Neon dipakai untuk produksi nanti, branch `dev` untuk pengembangan lokal.

## 1. Buat project dan branch

1. Daftar atau masuk di https://console.neon.tech.
2. **Create project**: nama `lapakin`, Postgres versi terbaru yang ditawarkan, region **Singapore (ap-southeast-1)**.
3. Di menu **Branches**, buat branch `dev` dari `main`. Pakai branch `dev` untuk semua langkah di bawah.

## 2. Ambil connection string

1. Di dashboard, pilih branch `dev`, klik **Connect**.
2. Matikan opsi **Connection pooling** (agar mendapat *direct connection*). Untuk migrasi dan pengembangan lokal, direct connection yang paling sederhana.
3. Salin connection string. Bentuknya `postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

Connection string berisi password. Jangan menempelkannya ke chat, Issue, atau commit.

## 3. Isi `.env`

```bash
cp .env.example .env
openssl rand -base64 32
```

Buka `.env`, isi `POSTGRES_URL` dengan connection string tadi, dan `AUTH_SECRET` dengan hasil `openssl`. Biarkan nilai Stripe sebagai placeholder. Itu hanya agar aplikasi bisa dijalankan sampai Issue #12 selesai.

`.env` sudah masuk `.gitignore`. Cek dengan `git status`: file `.env` tidak boleh muncul.

## 4. Migrasi, seed, dan jalankan

```bash
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`db:seed` membuat pengguna uji `test@test.com` (password `admin123`) dan satu tim. Hanya untuk pengembangan lokal, jangan dipakai di produksi.

Buka http://localhost:3000, masuk dengan akun uji, dan pastikan dashboard terbuka.

## Catatan

- Skrip `db:setup` bawaan starter dihapus karena mewajibkan Stripe CLI dan Docker. Seed tidak lagi membuat produk Stripe.
- Untuk Cloudflare Workers (Issue #13) kemungkinan perlu connection string **pooled** dan driver yang berbeda. Itu dikerjakan di Issue tersebut.
