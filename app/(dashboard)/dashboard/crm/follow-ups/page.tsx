import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { formatDate, todayIn } from '@/modules/crm/format';
import { listFollowUps, type FollowUp } from '@/modules/crm/service';
import { FollowUpDone } from '@/modules/crm/ui/follow-up-done';

const KIND_LABEL: Record<string, string> = { call: 'Call', email: 'Email', meeting: 'Meeting', todo: 'To do' };

function Group({ title, tone, items }: { title: string; tone: string; items: FollowUp[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="mb-6 max-w-3xl" data-group={title}>
      <CardHeader>
        <CardTitle className={tone}>
          {title} <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{f.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[f.kind] ?? f.kind} · {formatDate(f.dueDate)}
                  {f.assigneeName ? ` · ${f.assigneeName}` : ''} ·{' '}
                  <Link href={`/dashboard/crm/${f.opportunityId}`} className="text-orange-600">{f.opportunityTitle}</Link>
                </p>
              </div>
              <FollowUpDone id={f.id} opportunityId={f.opportunityId} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const who = (await searchParams).who === 'all' ? 'all' : 'me';
  const today = todayIn();
  const items = await listFollowUps(ctx.teamId, who === 'me' ? { assignedTo: ctx.user.id } : {});

  const overdue = items.filter((f) => f.dueDate < today);
  const dueToday = items.filter((f) => f.dueDate === today);
  const upcoming = items.filter((f) => f.dueDate > today);

  const tab = (value: 'me' | 'all', label: string) => (
    <Link
      href={value === 'me' ? '/dashboard/crm/follow-ups' : '/dashboard/crm/follow-ups?who=all'}
      className={`rounded-md px-3 py-1.5 text-sm ${who === value ? 'bg-gray-100 font-medium text-gray-900' : 'text-muted-foreground hover:bg-gray-50'}`}
    >
      {label}
    </Link>
  );

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/crm" className="mb-4 inline-block text-sm text-orange-600">← CRM</Link>
      <h1 className="mb-4 text-lg lg:text-2xl font-medium text-gray-900">Follow-ups</h1>
      <div className="mb-6 flex gap-2">
        {tab('me', 'Assigned to me')}
        {tab('all', 'Everyone')}
      </div>

      {items.length === 0 ? (
        <Card className="max-w-3xl">
          <CardContent className="py-12 text-center">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Nothing to follow up</h3>
            <p className="mx-auto max-w-sm text-sm text-gray-500">
              {who === 'me' ? 'No open follow-ups are assigned to you.' : 'No open follow-ups on active opportunities.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Group title="Overdue" tone="text-red-700" items={overdue} />
          <Group title="Today" tone="text-gray-900" items={dueToday} />
          <Group title="Upcoming" tone="text-gray-900" items={upcoming} />
        </>
      )}
    </section>
  );
}
