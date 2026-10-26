import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { listTeamMembers } from '@/lib/db/queries';
import { listQuerySchema as contactsQuery } from '@/modules/contacts/schemas';
import { listContacts } from '@/modules/contacts/service';
import { createOpportunityAction } from '@/modules/crm/actions';
import { listStages } from '@/modules/crm/service';
import { OpportunityForm } from '@/modules/crm/ui/opportunity-form';

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const sp = await searchParams;
  const presetRaw = Number(Array.isArray(sp.contact) ? sp.contact[0] : sp.contact);
  const presetContact = Number.isInteger(presetRaw) && presetRaw > 0 ? presetRaw : null;

  const [contacts, members, stages] = await Promise.all([
    listContacts(ctx.teamId, contactsQuery.parse({ pageSize: 100 })),
    listTeamMembers(ctx.teamId),
    listStages(ctx.teamId),
  ]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/crm" className="mb-4 inline-block text-sm text-orange-600">← CRM</Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">New opportunity</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunityForm
            action={createOpportunityAction}
            submitLabel="Create opportunity"
            contacts={contacts.items.map((c) => ({ id: c.id, name: c.name }))}
            members={members.map((m) => ({ id: m.id, label: m.name || m.email }))}
            stages={stages.filter((s) => s.kind === 'open').map((s) => ({ id: s.id, name: s.name }))}
            initial={{
              title: '',
              contactId: presetContact,
              expectedValue: 0,
              expectedCloseDate: null,
              priority: 0,
              ownerId: ctx.user.id,
              notes: null,
            }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
