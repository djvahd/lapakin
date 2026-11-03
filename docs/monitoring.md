# Pemantauan produksi

Tujuan: tahu kalau situs bermasalah **sebelum** pengguna melapor. Dua lapis, keduanya gratis: log galat di Cloudflare dan pemantau waktu aktif.

## 1. Log galat (Workers Logs)

`wrangler.jsonc` mengaktifkan `observability`, dan `instrumentation.ts` mencatat setiap galat server (render halaman, route handler, server action) sebagai satu baris JSON lewat `console.error`:

```json
{"level":"error","event":"request_error","message":"...","name":"TypeError","method":"POST","path":"/dashboard/invoices/5","routePath":"/dashboard/invoices/[id]","routeType":"action","routerKind":"App Router"}
```

Hanya metadata: **tanpa** header (cookie sesi), body, atau query string. Galat bisnis yang ditangani form (mis. "Not enough stock") bukan galat server dan tidak dicatat di sini.

Melihat log:

- **Dasbor:** Cloudflare, Workers & Pages, `lapakin`, **Observability** (atau tab Logs). Filter `level = error` atau cari `request_error`, `health_check_failed`, `Automation scan failed`, `Cron automation gagal`.
- **Langsung:** `pnpm exec wrangler tail lapakin --format pretty` (hentikan dengan Ctrl+C; tail berhenti sendiri setelah beberapa jam).

Log disimpan sebatas retensi paket Cloudflare (di paket gratis singkat, hitungan hari). Catat temuan penting di tempat lain.

## 2. Pemantau waktu aktif

Endpoint `GET /api/health` (juga `HEAD`) menjawab `200 {"status":"ok"}` bila aplikasi hidup **dan** database terjangkau, atau `503 {"status":"error"}` bila tidak. Tanpa autentikasi dan tanpa detail.

Pasang pemantau gratis (UptimeRobot, Better Stack, atau sejenisnya), sekali saja:

1. Buat akun di layanan itu.
2. Monitor baru, jenis **HTTP(s)**, URL `https://lapakin.adrielharjanto.workers.dev/api/health`.
3. Interval 5 menit. Pengecekan kata kunci (opsional): harus memuat `"status":"ok"`.
4. Peringatan lewat email (dan Telegram bila tersedia) ke alamat yang Anda baca.
5. Uji: matikan sementara dengan memantau URL yang salah (`/api/healthx`, harus 404 dan memicu peringatan), lalu kembalikan.

Satu pemantau ini menangkap: situs mati, deploy rusak, database tidak terjangkau (mis. Neon tertidur lama atau kredensial salah).

## 3. Hal yang perlu diperhatikan rutin

| Apa | Di mana | Tanda masalah |
|---|---|---|
| Cron harian (01:00 UTC) | Observability, cari `Automation scan failed` / `Cron automation gagal` | Baris galat, atau pengingat tidak muncul |
| Webhook Midtrans | Dasbor Midtrans, Transactions: status notifikasi | Notifikasi berstatus gagal (bukan 200) |
| CI | Notifikasi email GitHub untuk run merah | Run `main` merah |
| Backup database | Tab Actions, workflow "Backup database" ([panduan](backup-restore.md)) | Run merah, atau tidak ada run dalam 2 hari |

## Batasan

- Belum ada pelacakan galat di sisi peramban (galat JavaScript klien) dan belum ada penyaringan peringatan otomatis dari log; pemantau waktu aktif adalah satu-satunya peringatan otomatis.
- Bila nanti butuh pelacak galat lengkap (Sentry atau sejenisnya), tambahkan di `instrumentation.ts`; `formatRequestError` sudah memisahkan data yang aman dikirim.
