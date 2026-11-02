# Data demo

Skrip `scripts/seed-demo.ts` membuat satu toko contoh yang realistis, untuk demo ke calon klien, tangkapan layar, dan portofolio.

## Isi

Toko **Kopi Nusantara (Demo)**, paket Pro setahun, dengan pemilik `demo@lapakin.test` (kata sandi `demo12345`):

| Modul | Data |
|---|---|
| Kontak | 5 perusahaan (4 pelanggan, 1 pemasok) dan 5 orang |
| Inventory | 5 produk (4 berstok dengan stok awal, 1 jasa), satu di bawah batas stok menipis |
| CRM | 4 peluang di tahapan berbeda, 2 tindak lanjut (satu sudah terlambat) |
| Penjualan | Pesanan terkirim penuh; terkirim sebagian; terkirim dan belum dibayar; terkonfirmasi belum dikirim; penawaran terkirim; penawaran draf terkait peluang |
| Faktur | Lunas, dibayar sebagian, dan **lewat jatuh tempo** (3 faktur) |
| Otomasi | Dua aturan (faktur lewat tempo, tindak lanjut terlambat) dan notifikasi yang dihasilkan pemindai dari data di atas |

Tanggal dibuat relatif terhadap hari menjalankan skrip, jadi faktur yang "lewat tempo" selalu lewat tempo.

## Menjalankan

Hanya terhadap branch **pengembangan atau demo**, tidak pernah produksi.

```bash
pnpm db:seed:demo            # membuat (menolak bila sudah ada)
pnpm db:seed:demo --reset    # menghapus toko demo lama lalu membuat ulang
```

Skrip berjalan lewat layanan aplikasi sebagai role `lapakin_app` (`POSTGRES_URL`), jadi data demo juga menguji logikanya. `--reset` memakai `MIGRATION_URL` (pemilik) karena mutasi stok dan pembayaran tidak bisa dihapus oleh role aplikasi. Skrip menolak jalan bila `NODE_ENV=production` dan mencetak host database yang dipakai (disamarkan) supaya Anda bisa memeriksa sebelum data dibuat.

## Demo online: belum dipasang, dan keputusannya ada pada pemilik

Skrip hanya menyiapkan **data**. Menayangkannya untuk publik memerlukan keputusan yang belum diambil:

1. **Database terpisah.** Buat branch Neon `demo` (dari `dev`, **tanpa kedaluwarsa**), jalankan migrasi dan seed demo di sana. Jangan memakai `production`.
2. **Worker terpisah** (mis. `lapakin-demo`) dengan secret `POSTGRES_URL` menunjuk branch `demo`, `AUTH_SECRET` sendiri, tanpa `CRON_SECRET`/Midtrans. Konfigurasi Wrangler kedua dan perintah deploy-nya belum dibuat atau diuji.
3. **Cara pengunjung masuk.** Pilihan: (a) tampilkan kredensial demo di halaman demo, sederhana tetapi semua pengunjung berbagi satu akun; (b) tombol "Coba demo" yang masuk otomatis; (c) peran baca-saja. Peran baca-saja belum ada di aplikasi.
4. **Penyalahgunaan dan kebersihan data.** Siapa pun yang masuk bisa mengubah atau memenuhi data. Rekomendasi: reset terjadwal (`--reset`, mis. harian) lewat GitHub Actions terjadwal dengan secret URL pemilik branch `demo`, dan jangan pernah menaruh data asli di sana. Demo tidak boleh menyimpan pembayaran sungguhan; tanpa `MIDTRANS_SERVER_KEY` tombol bayar menampilkan galat yang jelas.
5. **Penandaan.** Spanduk "Ini data demo, direset tiap hari" di dashboard demo supaya tidak disangka produksi.

Rekomendasi: opsi (a) dengan reset harian. Paling murah, tanpa kode aplikasi baru. Beri tahu bila mau dilanjutkan, dan sesi berikutnya menyiapkan konfigurasi Worker demo dan workflow reset.
