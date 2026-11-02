import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: `Kebijakan Privasi | ${SITE.name}` };

export default function PrivacyPage() {
  return (
    <LegalPage title="Kebijakan Privasi">
      <p>
        Halaman ini menjelaskan data apa yang dikumpulkan {SITE.name}
        {SITE.legalName ? ` (${SITE.legalName})` : ''}, untuk apa, dan hak Anda atas data itu.
      </p>

      <h2>1. Data yang kami kumpulkan</h2>
      <ul>
        <li><strong>Akun:</strong> nama, alamat email, dan kata sandi (disimpan dalam bentuk hash, tidak bisa dibaca kembali).</li>
        <li><strong>Data usaha yang Anda masukkan:</strong> kontak pelanggan dan pemasok, peluang, produk dan stok, penawaran, pesanan, faktur, dan pembayaran. Data ini milik Anda.</li>
        <li><strong>Catatan aktivitas:</strong> tindakan penting di akun (misalnya masuk, membuat faktur) beserta waktu dan alamat IP, untuk keamanan dan jejak audit.</li>
        <li><strong>Pembayaran langganan:</strong> nomor pesanan, jumlah, dan status dari Midtrans. Kami <strong>tidak</strong> menerima atau menyimpan nomor kartu, rekening, atau PIN.</li>
        <li><strong>Cookie sesi:</strong> satu cookie untuk menjaga Anda tetap masuk. Kami tidak memakai cookie iklan.</li>
      </ul>

      <h2>2. Untuk apa data dipakai</h2>
      <ul>
        <li>Menjalankan fitur Layanan dan memisahkan data tiap toko.</li>
        <li>Memproses dan mencatat pembayaran langganan.</li>
        <li>Mengirim pemberitahuan terkait akun dan layanan (misalnya notifikasi aturan otomasi yang Anda buat).</li>
        <li>Menjaga keamanan, mencegah penyalahgunaan, dan memenuhi kewajiban hukum.</li>
      </ul>
      <p>Kami tidak menjual data Anda dan tidak memakainya untuk iklan pihak ketiga.</p>

      <h2>3. Pihak yang memproses data</h2>
      <p>Untuk menjalankan Layanan kami memakai penyedia berikut:</p>
      <ul>
        <li><strong>Cloudflare</strong> untuk hosting aplikasi;</li>
        <li><strong>Neon</strong> untuk basis data PostgreSQL;</li>
        <li><strong>Midtrans</strong> untuk pembayaran langganan (tunduk pada kebijakan privasi Midtrans).</li>
      </ul>
      <p>Data dapat diproses di server penyedia tersebut yang berada di luar Indonesia. Kami hanya membagikan data yang diperlukan untuk fungsi masing-masing.</p>

      <h2>4. Penyimpanan dan keamanan</h2>
      <p>
        Data disimpan selama akun aktif. Setiap toko dipisahkan di level basis data (row level security), koneksi memakai enkripsi,
        dan kata sandi di-hash. Tidak ada sistem yang sepenuhnya kebal; bila terjadi insiden yang memengaruhi data Anda, kami akan
        memberi tahu sesuai ketentuan yang berlaku.
      </p>

      <h2>5. Hak Anda</h2>
      <p>
        Sesuai peraturan pelindungan data pribadi yang berlaku di Indonesia, Anda berhak mengakses, memperbaiki, meminta salinan, dan
        meminta penghapusan data pribadi Anda, serta menarik persetujuan. Kirim permintaan lewat halaman{' '}
        <Link href="/contact" className="text-orange-600 underline">Kontak</Link>; kami menanggapi dalam waktu wajar. Data yang wajib
        kami simpan menurut hukum (misalnya catatan transaksi pembayaran) dapat dipertahankan sebatas diwajibkan.
      </p>

      <h2>6. Data pelanggan Anda</h2>
      <p>
        Untuk data pribadi pelanggan atau pemasok yang Anda masukkan, Anda yang menentukan tujuan dan caranya; kami bertindak sebagai
        pemroses atas nama Anda. Pastikan Anda memiliki dasar yang sah untuk menyimpan data tersebut.
      </p>

      <h2>7. Perubahan</h2>
      <p>Perubahan kebijakan ini diumumkan di halaman ini dengan tanggal pembaruan di atas.</p>
    </LegalPage>
  );
}
