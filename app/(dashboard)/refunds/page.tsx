import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: `Pengembalian Dana | ${SITE.name}` };

export default function RefundsPage() {
  return (
    <LegalPage title="Kebijakan Pengembalian Dana">
      <p>
        {SITE.name} adalah layanan digital: paket berbayar aktif segera setelah pembayaran dikonfirmasi, jadi tidak ada barang
        yang dikirim.
      </p>

      <h2>1. Prinsip umum</h2>
      <p>
        Pembayaran langganan bersifat final untuk periode yang sudah berjalan. Paket Free tersedia untuk mencoba Layanan sebelum
        membeli. Karena langganan tidak diperpanjang otomatis, Anda tidak akan ditagih tanpa tindakan Anda sendiri.
      </p>

      <h2>2. Kapan dana dikembalikan</h2>
      <p>Kami mengembalikan dana penuh untuk pembayaran yang bersangkutan bila:</p>
      <ul>
        <li>terjadi pembayaran ganda untuk pesanan yang sama;</li>
        <li>pembayaran berhasil di Midtrans tetapi paket tidak aktif dan tidak dapat kami aktifkan dalam 3 hari kerja;</li>
        <li>Layanan tidak dapat dipakai secara berkelanjutan karena gangguan dari pihak kami, lebih dari 72 jam berturut-turut dalam periode yang sudah dibayar (dikembalikan secara proporsional untuk sisa periode).</li>
      </ul>

      <h2>3. Kapan tidak dikembalikan</h2>
      <ul>
        <li>Berubah pikiran atau tidak lagi memakai Layanan setelah paket aktif.</li>
        <li>Akun ditangguhkan karena melanggar Syarat dan Ketentuan.</li>
        <li>Kesalahan input data atau pemakaian fitur oleh pengguna.</li>
      </ul>

      <h2>4. Cara mengajukan</h2>
      <p>
        Ajukan dalam 7 hari setelah tanggal pembayaran lewat halaman <Link href="/contact" className="text-orange-600 underline">Kontak</Link>,
        sertakan email akun dan nomor pesanan (format <code>LPK-…</code>, ada di riwayat pembayaran dan email dari Midtrans). Kami
        menanggapi dalam 3 hari kerja.
      </p>

      <h2>5. Proses pengembalian</h2>
      <p>
        Dana dikembalikan lewat Midtrans ke metode pembayaran semula bila memungkinkan, atau lewat transfer bank bila metode semula
        tidak mendukung pengembalian. Waktu masuknya dana bergantung pada bank atau penyedia e-wallet, umumnya 3 sampai 14 hari kerja.
      </p>
    </LegalPage>
  );
}
