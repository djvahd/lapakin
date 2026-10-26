import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { listTeamMembers } from '@/lib/db/queries';
import { listQuerySchema as contactsQuery } from '@/modules/contacts/schemas';
import { listContacts } from '@/modules/contacts/service';
import { updateOpportunityAction } from '@/modules/crm/actions';
import { PRIORITY_LABELS, formatDate, formatMoney, todayIn } from '@/modules/crm/format';
import { getOpportunity } from '@/modules/crm/service';
import { ActivityPanel } from '@/modules/crm/ui/activity-panel';
import { ArchiveButton } from '@/modules/crm/ui/archive-button';
import { MoveSelect } from '@/modules/crm/ui/move-select';
import { OpportunityForm } from '@/modules/crm/ui/opportunity-form';

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const opportunity = await getOpportunity(ctx.teamId, id);
  if (!opportunity) notFound();

  const [contacts, members] = await Promise.all([
    listContacts(ctx.teamId, contactsQuery.parse({ pageSize: 100 })),
    listTeamMembers(ctx.teamId),
  ]);

  const archived = Boolean(opportunity.archivedAt);
  const canArchive = can(ctx.role, 'crm:archive');
  const memberOptions = members.map((m) => ({ id: m.id, label: m.name || m.email }));
  const weighted = Math.round(opportunity.expectedValue * opportunity.stage.probability) / 100;
  const closed = opportunity.stage.kind !== 'open';

  // Kontak terarsip tetap perlu muncul di pilihan agar tidak hilang diam-diam saat menyimpan.
  const contactOptions = contacts.items.map((c) => ({ id: c.id, name: c.name }));
  if (opportunity.contactId && opportunity.contactName && !contactOptions.some((c) => c.id === opportunity.contactId)) {
    contactOptions.unshift({ id: opportunity.contactId, name: opportunity.contactName });
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/crm" className="mb-4 inline-block text-sm text-orange-600">← CRM</Link>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">{opportunity.title}</h1>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{opportunity.stage.name}</span>
        {opportunity.priority > 0 && (
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
            {PRIORITY_LABELS[opportunity.priority]}
          </span>
        )}
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        {formatMoney(opportunity.expectedValue)}
        {!closed && opportunity.stage.probability > 0 && <> · weighted {formatMoney(weighted)} ({opportunity.stage.probability}%)</>}
        {opportunity.expectedCloseDate && <> · close {formatDate(opportunity.expectedCloseDate)}</>}
        {opportunity.contactName && opportunity.contactId && (
          <>
            {' · '}
            <Link href={`/dashboard/contacts/${opportunity.contactId}`} className="text-orange-600">{opportunity.contactName}</Link>
          </>
        )}
        {opportunity.ownerName && <> · {opportunity.ownerName}</>}
      </p>

      {archived && (
        <p className="mb-6 max-w-2xl rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          This opportunity is archived and cannot be edited. {canArchive ? 'Restore it to make changes.' : 'Ask a team owner to restore it.'}
        </p>
      )}
      {opportunity.stage.kind === 'won' && (
        <p className="mb-6 max-w-2xl rounded-md bg-green-50 p-3 text-sm text-green-800">
          Won{opportunity.closedAt ? ` on ${formatDate(new Date(opportunity.closedAt).toISOString().slice(0, 10))}` : ''}.
        </p>
      )}
      {opportunity.stage.kind === 'lost' && (
        <p className="mb-6 max-w-2xl rounded-md bg-red-50 p-3 text-sm text-red-800">
          Lost{opportunity.lostReason ? `: ${opportunity.lostReason}` : ' (no reason recorded)'}.
        </p>
      )}

      {!archived && (
        <Card className="mb-8 max-w-2xl">
          <CardHeader>
            <CardTitle>Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <MoveSelect
              opportunityId={opportunity.id}
              currentStageId={opportunity.stageId}
              stages={opportunity.stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind }))}
            />
          </CardContent>
        </Card>
      )}

      <Card className="mb-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {archived ? (
            <dl className="space-y-2 text-sm">
              {[
                ['Contact', opportunity.contactName],
                ['Owner', opportunity.ownerName],
                ['Notes', opportunity.notes],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <OpportunityForm
              action={updateOpportunityAction}
              submitLabel="Save changes"
              contacts={contactOptions}
              members={memberOptions}
              initial={{
                id: opportunity.id,
                title: opportunity.title,
                contactId: opportunity.contactId,
                expectedValue: opportunity.expectedValue,
                expectedCloseDate: opportunity.expectedCloseDate,
                priority: opportunity.priority,
                ownerId: opportunity.ownerId,
                notes: opportunity.notes,
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card className="mb-8 max-w-2xl">
        <CardHeader>
          <CardTitle>Follow-ups</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityPanel
            opportunityId={opportunity.id}
            activities={opportunity.activities}
            members={memberOptions}
            currentUserId={ctx.user.id}
            today={todayIn()}
            canSchedule={!archived}
          />
        </CardContent>
      </Card>

      {canArchive && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{archived ? 'Restore' : 'Archive'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {archived ? 'Restoring puts this opportunity back on the board.' : 'Archived opportunities leave the board but are kept for reporting.'}
            </p>
            <ArchiveButton id={opportunity.id} archived={archived} />
          </CardContent>
        </Card>
      )}
    </section>
  );
}
