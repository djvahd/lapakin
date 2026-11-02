import { SITE } from '@/lib/site';
import { SiteFooter } from '@/components/site-footer';

// Kerangka halaman teks hukum: judul, tanggal revisi, isi, lalu footer situs.
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">Terakhir diperbarui: {SITE.legalUpdated}</p>
        <div className="mt-8 space-y-4 text-gray-700 leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-gray-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
