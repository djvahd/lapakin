// Identitas dan kontak usaha yang tampil di situs publik (landing, syarat, privasi, kontak).
// Ini data publik, bukan rahasia: isi langsung di sini. Kolom yang masih `null` tidak ditampilkan,
// tetapi Midtrans dan pengguna mengharapkan setidaknya email dan alamat usaha terisi sebelum rilis.
export const SITE = {
  name: 'Lapakin',
  tagline: 'ERP dan CRM ringan untuk usaha kecil dan menengah',
  // Nama pemilik usaha atau badan hukum yang menerima pembayaran.
  legalName: 'Jovanic Adriel Harjanto' as string | null,
  email: 'adrielharjanto@gmail.com' as string | null,
  phone: '+62 812-2923-7709' as string | null,
  address: 'Jl. Delima Raya D1/18, RT 002/RW 002, Kelurahan Kramat Utara, Kecamatan Magelang Utara, Kota Magelang, Jawa Tengah 56115' as string | null,
  // Tanggal revisi terakhir halaman hukum.
  legalUpdated: '2 November 2026',
};
