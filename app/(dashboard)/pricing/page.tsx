import Link from 'next/link';
import { Check } from 'lucide-react';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { PLANS } from '@/lib/payments/plans';
import { getSubscription } from '@/lib/payments/subscription';
import { SiteFooter } from '@/components/site-footer';
import { CheckoutButtons } from './checkout-buttons';

const idr = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

const FREE_FEATURES = ['Semua modul dengan data sendiri', 'Satu pengguna (pemilik toko)', 'Tanpa kartu kredit, upgrade kapan saja'];

export default async function PricingPage() {
  const ctx = await getTenantContext();
  const sub = ctx ? await getSubscription(ctx.teamId) : null;
  const pro = PLANS.pro;
  const canPay = ctx ? can(ctx.role, 'billing:manage') : false;

  return (
    <>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        <div className="pt-6">
          <h2 className="text-2xl font-medium text-gray-900 mb-2">Free</h2>
          <p className="text-4xl font-medium text-gray-900 mb-6">{idr(0)}</p>
          <ul className="space-y-4 mb-8">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start">
                <Check className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{f}</span>
              </li>
            ))}
          </ul>
          {!ctx && (
            <Link href="/sign-up" className="block w-full rounded-full border px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50">
              Daftar gratis
            </Link>
          )}
        </div>

        <div className="pt-6">
          <h2 className="text-2xl font-medium text-gray-900 mb-2">{pro.name}</h2>
          <p className="text-4xl font-medium text-gray-900 mb-1">
            {idr(pro.prices.month)} <span className="text-xl font-normal text-gray-600">/ bulan</span>
          </p>
          <p className="text-sm text-gray-600 mb-6">
            atau {idr(pro.prices.year)} / tahun (hemat 2 bulan)
          </p>
          <ul className="space-y-4 mb-8">
            {pro.features.map((f) => (
              <li key={f} className="flex items-start">
                <Check className="h-5 w-5 text-orange-500 mr-2 mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{f}</span>
              </li>
            ))}
          </ul>

          {sub?.active && sub.expiresAt && (
            <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
              Paket {pro.name} aktif sampai {sub.expiresAt.toLocaleDateString('id-ID', { dateStyle: 'long' })}. Bayar lagi untuk memperpanjang.
            </p>
          )}

          {!ctx ? (
            <Link href="/sign-up?redirect=pricing" className="block w-full rounded-full bg-orange-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-orange-600">
              Daftar untuk berlangganan
            </Link>
          ) : canPay ? (
            <CheckoutButtons
              plan="pro"
              monthLabel={sub?.active ? `Perpanjang 1 bulan (${idr(pro.prices.month)})` : `Bayar bulanan (${idr(pro.prices.month)})`}
              yearLabel={sub?.active ? `Perpanjang 1 tahun (${idr(pro.prices.year)})` : `Bayar tahunan (${idr(pro.prices.year)})`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Hanya pemilik toko yang dapat membayar langganan.</p>
          )}
          <p className="mt-4 text-xs text-gray-500">
            Pembayaran lewat Midtrans: QRIS, transfer bank (virtual account), e-wallet, atau kartu. Tidak ada tagihan otomatis:
            perpanjang sendiri sebelum paket berakhir.
          </p>
        </div>
      </div>
    </main>
    <SiteFooter />
    </>
  );
}
