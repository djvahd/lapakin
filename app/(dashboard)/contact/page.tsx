import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: `Kontak | ${SITE.name}` };

export default function ContactPage() {
  const hasContact = Boolean(SITE.email || SITE.phone || SITE.address || SITE.legalName);
  return (
    <LegalPage title="Kontak">
      <p>Pertanyaan tentang layanan, tagihan, pengembalian dana, atau data pribadi Anda dapat dikirim lewat kontak berikut.</p>
      {hasContact ? (
        <dl className="space-y-3">
          {SITE.legalName && (
            <div>
              <dt className="font-medium text-gray-900">Penyelenggara</dt>
              <dd>{SITE.legalName}</dd>
            </div>
          )}
          {SITE.email && (
            <div>
              <dt className="font-medium text-gray-900">Email</dt>
              <dd><a href={`mailto:${SITE.email}`} className="text-orange-600 underline">{SITE.email}</a></dd>
            </div>
          )}
          {SITE.phone && (
            <div>
              <dt className="font-medium text-gray-900">Telepon / WhatsApp</dt>
              <dd>{SITE.phone}</dd>
            </div>
          )}
          {SITE.address && (
            <div>
              <dt className="font-medium text-gray-900">Alamat</dt>
              <dd className="whitespace-pre-line">{SITE.address}</dd>
            </div>
          )}
        </dl>
      ) : (
        <p>Informasi kontak akan ditampilkan di sini.</p>
      )}
      <p>Kami menanggapi dalam 3 hari kerja.</p>
    </LegalPage>
  );
}
