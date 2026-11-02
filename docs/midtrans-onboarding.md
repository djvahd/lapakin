# Pendaftaran Midtrans: dokumen tambahan

Midtrans meminta "Dokumen tambahan": **website yang bisa diakses sampai tahap landing page, dengan informasi lengkap barang/jasa dan harga**. Situs Lapakin menyediakannya setelah di-deploy:

| Yang diminta peninjau | Halaman |
|---|---|
| Landing page dengan penjelasan layanan | `/` |
| Daftar jasa dan harga | `/` (bagian Harga) dan `/pricing` |
| Syarat dan ketentuan | `/terms` |
| Kebijakan privasi | `/privacy` |
| Kebijakan pengembalian dana | `/refunds` |
| Identitas dan kontak usaha | `/contact` dan footer semua halaman publik |

## Sebelum mengirim ulang formulir

1. **Isi identitas usaha** di `lib/site.ts`: `legalName`, `email`, `phone`, `address`. Kolom yang masih `null` tidak ditampilkan, tetapi peninjau hampir pasti mengharapkan setidaknya nama usaha, email, dan alamat. Ini data publik, bukan rahasia.
2. **Baca dan sesuaikan teks hukum.** `/terms`, `/privacy`, dan `/refunds` adalah draf yang disesuaikan dengan cara Lapakin bekerja (langganan per periode tanpa perpanjangan otomatis, Midtrans sebagai pemroses pembayaran, kebijakan dana kembali 7 hari untuk kasus tertentu). Itu bukan nasihat hukum: periksa angka dan janjinya, dan minta telaah konsultan hukum sebelum mengandalkannya. Kebijakan pengembalian dana khususnya adalah keputusan bisnis Anda.
3. **Deploy** (`pnpm run cf:deploy`) dan pastikan semua halaman di atas bisa dibuka tanpa login dari URL publik (misalnya `https://lapakin.<akun>.workers.dev`). Midtrans biasanya menolak URL yang butuh login atau yang masih berisi template.
4. **Buat PDF dokumen pendukung** setelah situs ter-deploy (kolom "Dokumen Tambahan" menerima berkas):
   ```bash
   node scripts/midtrans-doc.mjs https://lapakin.adrielharjanto.workers.dev
   ```
   Hasilnya `docs/generated/dokumen-pendukung-midtrans.pdf` (tidak di-commit): identitas usaha (dibaca dari `/contact`), layanan dan harga (dari `lib/payments/plans.ts`), cara pembayaran, daftar halaman publik, dan tangkapan layar landing, harga, kebijakan, serta footer. Skrip menolak jalan bila situs masih menampilkan template starter atau identitas belum terisi, jadi tidak mungkin membuat dokumen dari situs yang belum siap. Pakai `E2E_CHANNEL=msedge` bila Chromium Playwright belum terpasang.
5. Setelah akun disetujui, ikuti catatan rilis pembayaran di `docs/deploy-cloudflare.md` (server key, Notification URL).

Catatan: nama usaha dan rekening yang Anda daftarkan di Midtrans sebaiknya konsisten dengan `legalName` dan isi `/contact`.
