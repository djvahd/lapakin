import Link from 'next/link';
import { ArrowRight, Check, Contact, Handshake, Package, Receipt, ShoppingCart, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/site-footer';
import { PLANS } from '@/lib/payments/plans';
import { SITE } from '@/lib/site';

const idr = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

const MODULES = [
  { icon: Contact, name: 'Kontak', text: 'Simpan pelanggan dan pemasok, kelompokkan dengan tag, dan cari dalam sekejap.' },
  { icon: Handshake, name: 'CRM', text: 'Pantau peluang penjualan di papan tahapan, catat tindak lanjut, dan lihat nilai pipeline.' },
  { icon: Package, name: 'Inventory', text: 'Kelola produk dan varian, catat stok masuk dan keluar, dan terima peringatan stok menipis.' },
  { icon: ShoppingCart, name: 'Penjualan', text: 'Buat penawaran, konfirmasi menjadi pesanan, dan catat pengiriman sebagian atau penuh.' },
  { icon: Receipt, name: 'Faktur', text: 'Terbitkan faktur dari pesanan, catat pembayaran sebagian, pantau piutang, dan cetak PDF.' },
  { icon: Zap, name: 'Otomasi', text: 'Pengingat otomatis untuk faktur lewat jatuh tempo dan tindak lanjut yang terlambat.' },
];

const FLOW = ['Kontak', 'Peluang', 'Penawaran', 'Pesanan', 'Stok berkurang', 'Faktur', 'Pembayaran'];

const FAQ = [
  {
    q: 'Untuk siapa Lapakin?',
    a: 'Usaha kecil dan menengah di bidang jasa dan perdagangan yang ingin menggantikan catatan terpisah (spreadsheet, buku, chat) dengan satu aplikasi yang saling terhubung.',
  },
  {
    q: 'Bagaimana cara membayar langganan?',
    a: 'Lewat Midtrans: QRIS, transfer bank (virtual account), e-wallet, atau kartu. Tidak ada tagihan otomatis; Anda membayar per bulan atau per tahun dan memperpanjang sendiri.',
  },
  {
    q: 'Apakah data saya aman dan milik saya?',
    a: 'Data setiap toko dipisahkan di level database, dan Anda tetap pemilik datanya. Lihat Kebijakan Privasi untuk rinciannya.',
  },
  {
    q: 'Bisakah saya mencoba dulu?',
    a: 'Bisa. Paket Free gratis dan tidak meminta kartu. Upgrade ke Pro kapan saja.',
  },
];

export default function HomePage() {
  const pro = PLANS.pro;
  return (
    <>
      <main>
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl">
              {SITE.tagline}
              <span className="block text-orange-500">dalam satu aplikasi</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 sm:text-xl">
              Kelola kontak, peluang penjualan, stok, penawaran, pengiriman, faktur, dan pembayaran tanpa berpindah-pindah catatan.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/sign-up">
                <Button size="lg" className="text-lg rounded-full bg-orange-500 hover:bg-orange-600 text-white">
                  Daftar gratis <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="text-lg rounded-full">
                  Lihat harga
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 bg-white" aria-labelledby="fitur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 id="fitur" className="text-2xl font-semibold text-gray-900 text-center">Satu alur dari prospek sampai pembayaran</h2>
            <ol className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-700">
              {FLOW.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className="rounded-full bg-orange-50 px-3 py-1 font-medium text-orange-700">{step}</span>
                  {i < FLOW.length - 1 && <ArrowRight className="h-4 w-4 text-gray-400" aria-hidden />}
                </li>
              ))}
            </ol>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => (
                <div key={m.name}>
                  <div className="flex items-center justify-center h-12 w-12 rounded-md bg-orange-500 text-white">
                    <m.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-medium text-gray-900">{m.name}</h3>
                  <p className="mt-2 text-gray-600">{m.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 bg-gray-50" aria-labelledby="harga">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 id="harga" className="text-2xl font-semibold text-gray-900 text-center">Harga</h2>
            <p className="mt-2 text-center text-gray-600">Bayar per periode, tanpa kontrak dan tanpa tagihan otomatis.</p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border bg-white p-6">
                <h3 className="text-xl font-medium text-gray-900">Free</h3>
                <p className="mt-2 text-3xl font-medium text-gray-900">{idr(0)}</p>
                <ul className="mt-4 space-y-2 text-gray-700">
                  <li className="flex gap-2"><Check className="h-5 w-5 text-orange-500 flex-shrink-0" />Kontak, CRM, Inventory, Penjualan, dan Faktur</li>
                  <li className="flex gap-2"><Check className="h-5 w-5 text-orange-500 flex-shrink-0" />Satu pengguna (pemilik toko)</li>
                  <li className="flex gap-2"><Check className="h-5 w-5 text-orange-500 flex-shrink-0" />Tanpa kartu kredit</li>
                </ul>
              </div>
              <div className="rounded-lg border-2 border-orange-500 bg-white p-6">
                <h3 className="text-xl font-medium text-gray-900">{pro.name}</h3>
                <p className="mt-2 text-3xl font-medium text-gray-900">
                  {idr(pro.prices.month)} <span className="text-base font-normal text-gray-600">/ bulan</span>
                </p>
                <p className="text-sm text-gray-600">atau {idr(pro.prices.year)} / tahun (hemat 2 bulan)</p>
                <ul className="mt-4 space-y-2 text-gray-700">
                  <li className="flex gap-2"><Check className="h-5 w-5 text-orange-500 flex-shrink-0" />Semua yang ada di Free</li>
                  <li className="flex gap-2"><Check className="h-5 w-5 text-orange-500 flex-shrink-0" />Anggota tim tanpa batas</li>
                  <li className="flex gap-2"><Check className="h-5 w-5 text-orange-500 flex-shrink-0" />Otomasi dan notifikasi pengingat</li>
                </ul>
              </div>
            </div>
            <div className="mt-8 text-center">
              <Link href="/pricing" className="text-orange-600 font-medium hover:underline">
                Lihat rincian dan cara bayar →
              </Link>
            </div>
          </div>
        </section>

        <section className="py-16 bg-white" aria-labelledby="faq">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 id="faq" className="text-2xl font-semibold text-gray-900 text-center">Pertanyaan umum</h2>
            <dl className="mt-8 space-y-6">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="font-medium text-gray-900">{f.q}</dt>
                  <dd className="mt-1 text-gray-600">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
