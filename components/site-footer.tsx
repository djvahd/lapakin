import Link from 'next/link';
import { SITE } from '@/lib/site';

// Footer situs publik: tautan hukum dan kontak yang diminta penyedia pembayaran.
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-gray-200 bg-white print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-sm text-gray-600">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <p className="font-medium text-gray-900">{SITE.name}</p>
            <p className="mt-1 max-w-xs">{SITE.tagline}</p>
            {SITE.legalName && <p className="mt-2">{SITE.legalName}</p>}
            {SITE.address && <p className="mt-1 max-w-xs">{SITE.address}</p>}
            {SITE.email && (
              <p className="mt-1">
                <a href={`mailto:${SITE.email}`} className="hover:text-gray-900">{SITE.email}</a>
              </p>
            )}
            {SITE.phone && <p className="mt-1">{SITE.phone}</p>}
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 self-start">
            <Link href="/pricing" className="hover:text-gray-900">Harga</Link>
            <Link href="/terms" className="hover:text-gray-900">Syarat dan Ketentuan</Link>
            <Link href="/contact" className="hover:text-gray-900">Kontak</Link>
            <Link href="/privacy" className="hover:text-gray-900">Kebijakan Privasi</Link>
            <span />
            <Link href="/refunds" className="hover:text-gray-900">Pengembalian Dana</Link>
          </nav>
        </div>
        <p className="mt-6 text-xs text-gray-500">© {year} {SITE.name}. Pembayaran langganan diproses oleh Midtrans.</p>
      </div>
    </footer>
  );
}
