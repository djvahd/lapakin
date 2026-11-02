import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { PLANS } from '@/lib/payments/plans';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: `Syarat dan Ketentuan | ${SITE.name}` };

const idr = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

export default function TermsPage() {
  const pro = PLANS.pro;
  return (
    <LegalPage title="Syarat dan Ketentuan">
      <p>
        Dengan mendaftar atau memakai {SITE.name} ("Layanan"), Anda menyetujui syarat berikut. Layanan disediakan
        {SITE.legalName ? ` oleh ${SITE.legalName}` : ''} ("kami") untuk usaha yang mengelola kontak, penjualan, stok, dan faktur.
      </p>

      <h2>1. Akun dan toko</h2>
      <ul>
        <li>Anda harus memberi data pendaftaran yang benar dan menjaga kerahasiaan kata sandi.</li>
        <li>Satu akun pemilik mengelola satu atau lebih toko. Pemilik bertanggung jawab atas anggota yang diundangnya.</li>
        <li>Anda bertanggung jawab atas semua kegiatan yang terjadi di dalam akun Anda.</li>
      </ul>

      <h2>2. Paket dan harga</h2>
      <ul>
        <li>Paket Free gratis dengan batasan yang tercantum di halaman <Link href="/pricing" className="text-orange-600 underline">Harga</Link>.</li>
        <li>Paket {pro.name}: {idr(pro.prices.month)} per bulan atau {idr(pro.prices.year)} per tahun, dalam Rupiah.</li>
        <li>Langganan dibayar per periode dan <strong>tidak diperpanjang otomatis</strong>. Setelah masa berlaku habis, toko kembali ke paket Free dan data Anda tetap tersimpan.</li>
        <li>Harga dapat berubah. Perubahan tidak memengaruhi periode yang sudah dibayar.</li>
      </ul>

      <h2>3. Pembayaran</h2>
      <p>
        Pembayaran diproses oleh Midtrans (QRIS, transfer bank virtual account, e-wallet, kartu). Kami tidak menyimpan data kartu
        atau rekening Anda. Paket diaktifkan setelah Midtrans mengonfirmasi pembayaran. Ketentuan pengembalian dana ada di halaman{' '}
        <Link href="/refunds" className="text-orange-600 underline">Pengembalian Dana</Link>.
      </p>

      <h2>4. Pemakaian yang diizinkan</h2>
      <p>Anda tidak boleh memakai Layanan untuk:</p>
      <ul>
        <li>melanggar hukum atau hak pihak lain, termasuk menjual barang atau jasa terlarang;</li>
        <li>mengunggah data yang bukan hak Anda, atau data pribadi tanpa dasar yang sah;</li>
        <li>mengganggu, memindai tanpa izin, atau menyerang Layanan dan pengguna lain;</li>
        <li>menjual kembali akses Layanan tanpa persetujuan tertulis kami.</li>
      </ul>

      <h2>5. Data Anda</h2>
      <p>
        Data yang Anda masukkan tetap milik Anda. Kami memprosesnya hanya untuk menjalankan Layanan, sesuai{' '}
        <Link href="/privacy" className="text-orange-600 underline">Kebijakan Privasi</Link>. Anda bisa meminta salinan atau
        penghapusan data lewat kontak di bawah. Pembukuan dan faktur adalah catatan manajerial; Anda tetap bertanggung jawab atas
        kewajiban pajak dan pelaporan usaha Anda.
      </p>

      <h2>6. Ketersediaan dan perubahan</h2>
      <p>
        Kami berupaya menjaga Layanan tetap tersedia, tetapi tidak menjamin bebas gangguan. Kami dapat memperbarui atau mengubah fitur,
        dan akan memberi tahu perubahan yang berdampak besar lewat aplikasi atau email.
      </p>

      <h2>7. Penghentian</h2>
      <p>
        Anda dapat berhenti kapan saja. Kami dapat menangguhkan akun yang melanggar syarat ini setelah memberi tahu Anda, kecuali pelanggaran
        berat yang memerlukan tindakan segera.
      </p>

      <h2>8. Batasan tanggung jawab</h2>
      <p>
        Sejauh diizinkan hukum, tanggung jawab kami atas kerugian yang timbul dari pemakaian Layanan dibatasi sebesar jumlah yang
        Anda bayarkan untuk Layanan dalam tiga bulan terakhir. Kami tidak bertanggung jawab atas kerugian tidak langsung, seperti
        hilangnya keuntungan.
      </p>

      <h2>9. Hukum yang berlaku</h2>
      <p>Syarat ini tunduk pada hukum Republik Indonesia. Sengketa diupayakan diselesaikan secara musyawarah terlebih dahulu.</p>

      <h2>10. Kontak</h2>
      <p>
        Pertanyaan tentang syarat ini: lihat halaman <Link href="/contact" className="text-orange-600 underline">Kontak</Link>.
      </p>
    </LegalPage>
  );
}
