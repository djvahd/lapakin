import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { updateContactAction } from '@/modules/contacts/actions';
import { listQuerySchema } from '@/modules/contacts/schemas';
import { getContact, listContacts, listTags } from '@/modules/contacts/service';
import { ArchiveButton } from '@/modules/contacts/ui/archive-button';
import { ContactBadges } from '@/modules/contacts/ui/badges';
import { ContactForm } from '@/modules/contacts/ui/contact-form';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const contact = await getContact(ctx.teamId, id);
  if (!contact) notFound();

  const archived = Boolean(contact.archivedAt);
  const canArchive = can(ctx.role, 'contact:archive');
  const [companies, tags] = await Promise.all([
    listContacts(ctx.teamId, listQuerySchema.parse({ kind: 'company', pageSize: 100 })),
    listTags(ctx.teamId),
  ]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/contacts" className="mb-4 inline-block text-sm text-orange-600">← Contacts</Link>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">{contact.name}</h1>
        <ContactBadges contact={contact} tags={contact.tags} />
        {!archived && (
          <Link href={`/dashboard/crm/new?contact=${contact.id}`} className="text-sm text-orange-600">
            New opportunity →
          </Link>
        )}
      </div>

      {archived && (
        <p className="mb-6 max-w-2xl rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          This contact is archived and cannot be edited. {canArchive ? 'Restore it to make changes.' : 'Ask a team owner to restore it.'}
        </p>
      )}

      <Card className="mb-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {archived ? (
            <dl className="space-y-2 text-sm">
              {[
                ['Company', contact.companyName],
                ['Email', contact.email],
                ['Phone', contact.phone],
                ['Address', contact.address],
                ['Notes', contact.notes],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <ContactForm
              action={updateContactAction}
              submitLabel="Save changes"
              companies={companies.items.filter((c) => c.id !== contact.id).map((c) => ({ id: c.id, name: c.name }))}
              tags={tags}
              initial={{
                id: contact.id,
                kind: contact.kind as 'person' | 'company',
                name: contact.name,
                companyId: contact.companyId,
                email: contact.email,
                phone: contact.phone,
                address: contact.address,
                notes: contact.notes,
                isCustomer: contact.isCustomer,
                isSupplier: contact.isSupplier,
                tagIds: contact.tags.map((t) => t.id),
              }}
            />
          )}
        </CardContent>
      </Card>

      {contact.kind === 'company' && (
        <Card className="mb-8 max-w-2xl">
          <CardHeader>
            <CardTitle>People ({contact.people.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {contact.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No people are linked to this company yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {contact.people.map((p) => (
                  <li key={p.id} className="py-2">
                    <Link href={`/dashboard/contacts/${p.id}`} className="font-medium text-orange-600">{p.name}</Link>
                    {p.email && <span className="text-muted-foreground"> · {p.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {canArchive && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{archived ? 'Restore' : 'Archive'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {archived
                ? 'Restoring puts this contact back in the main list.'
                : 'Archived contacts are hidden from the main list but kept for past orders and invoices.'}
            </p>
            <ArchiveButton id={contact.id} archived={archived} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
