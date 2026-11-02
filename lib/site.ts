// Identitas dan kontak usaha yang tampil di situs publik (landing, syarat, privasi, kontak).
// Ini data publik, bukan rahasia: isi langsung di sini. Kolom yang masih `null` tidak ditampilkan,
// tetapi Midtrans dan pengguna mengharapkan setidaknya email dan alamat usaha terisi sebelum rilis.
export const SITE = {
  name: 'Lapakin',
  tagline: 'ERP dan CRM ringan untuk usaha kecil dan menengah',
  // Nama pemilik usaha atau badan hukum yang menerima pembayaran.
  legalName: null as string | null,
  email: null as string | null,
  phone: null as string | null,
  address: null as string | null,
  // Tanggal revisi terakhir halaman hukum.
  legalUpdated: '2 November 2026',
};
