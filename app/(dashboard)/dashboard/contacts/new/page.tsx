import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { createContactAction } from '@/modules/contacts/actions';
import { listContacts, listTags } from '@/modules/contacts/service';
import { ContactForm } from '@/modules/contacts/ui/contact-form';
import { listQuerySchema } from '@/modules/contacts/schemas';

export default async function NewContactPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const [companies, tags] = await Promise.all([
    listContacts(ctx.teamId, listQuerySchema.parse({ kind: 'company', pageSize: 100 })),
    listTags(ctx.teamId),
  ]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/contacts" className="mb-4 inline-block text-sm text-orange-600">← Contacts</Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">New contact</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactForm
            action={createContactAction}
            submitLabel="Create contact"
            companies={companies.items.map((c) => ({ id: c.id, name: c.name }))}
            tags={tags}
          />
        </CardContent>
      </Card>
    </section>
  );
}
