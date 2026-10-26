import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldClass } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { getTenantContext } from '@/lib/auth/tenant';
import { listTeamMembers } from '@/lib/db/queries';
import { boardHref, parseBoardParams } from '@/modules/crm/form';
import { formatMoney, todayIn } from '@/modules/crm/format';
import { listQuerySchema } from '@/modules/crm/schemas';
import { countOverdueFollowUps, getBoard, listOpportunities } from '@/modules/crm/service';
import { BoardCard } from '@/modules/crm/ui/board-card';

const columnTone: Record<string, string> = { won: 'text-green-700', lost: 'text-red-700', open: 'text-gray-900' };

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const query = parseBoardParams(await searchParams);
  const members = await listTeamMembers(ctx.teamId);
  const filtered = Boolean(query.q || query.ownerId || query.archived);

  const filterForm = (
    <form method="get" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
      <Input name="q" defaultValue={query.q ?? ''} placeholder="Search opportunities" aria-label="Search" />
      <select name="owner" defaultValue={query.ownerId ?? ''} className={fieldClass} aria-label="Owner">
        <option value="">All owners</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name || m.email}</option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="archived" value="1" defaultChecked={query.archived} /> Show archived
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="outline">Filter</Button>
        {filtered && (
          <Link href="/dashboard/crm">
            <Button type="button" variant="ghost">Reset</Button>
          </Link>
        )}
      </div>
    </form>
  );

  const overdueMine = await countOverdueFollowUps(ctx.teamId, ctx.user.id, todayIn());

  const header = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900">CRM</h1>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/dashboard/crm/follow-ups" className="text-orange-600">
          Follow-ups
          {overdueMine > 0 && (
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" aria-label={`${overdueMine} overdue`}>
              {overdueMine} overdue
            </span>
          )}
        </Link>
        <Link href="/dashboard/crm/stages" className="text-orange-600">Stages</Link>
        <Link href="/dashboard/crm/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="mr-2 h-4 w-4" /> New opportunity
          </Button>
        </Link>
      </div>
    </div>
  );

  if (query.archived) {
    const archived = await listOpportunities(
      ctx.teamId,
      listQuerySchema.parse({ q: query.q, ownerId: query.ownerId, archived: true, pageSize: 100 })
    );
    return (
      <section className="flex-1 p-4 lg:p-8">
        {header}
        {filterForm}
        <Card>
          <CardHeader>
            <CardTitle>
              Archived opportunities <span className="text-sm font-normal text-muted-foreground">({archived.total})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {archived.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No archived opportunities.</p>
            ) : (
              <ul className="divide-y">
                {archived.items.map((o) => (
                  <li key={o.id} className="py-3">
                    <Link href={`/dashboard/crm/${o.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                      <span className="font-medium text-gray-900">{o.title}</span>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[o.stageName, o.contactName, formatMoney(o.expectedValue)].filter(Boolean).join(' · ')}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }

  const board = await getBoard(ctx.teamId, { q: query.q, ownerId: query.ownerId });
  const stages = board.map((c) => ({ id: c.stage.id, name: c.stage.name, kind: c.stage.kind }));
  const today = todayIn();
  const total = board.reduce((n, c) => n + c.count, 0);
  const openWeighted = board.filter((c) => c.stage.kind === 'open').reduce((n, c) => n + c.weightedValue, 0);

  return (
    <section className="flex-1 p-4 lg:p-8">
      {header}
      {filterForm}

      <p className="mb-4 text-sm text-muted-foreground">
        {total} opportunit{total === 1 ? 'y' : 'ies'} · open pipeline (weighted) {formatMoney(openWeighted)}
        {filtered ? ' · filtered' : ''}
      </p>

      {total === 0 && !filtered ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">No opportunities yet</h3>
            <p className="mx-auto max-w-sm text-sm text-gray-500">Track a potential sale from first contact to won or lost.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {board.map((col) => (
            <div key={col.stage.id} className="w-72 shrink-0 rounded-lg bg-gray-50 p-3" data-stage={col.stage.name}>
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <h2 className={`text-sm font-semibold ${columnTone[col.stage.kind]}`}>{col.stage.name}</h2>
                  <span className="text-xs text-muted-foreground">{col.count}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(col.totalValue)}
                  {col.stage.kind === 'open' && col.stage.probability > 0 && (
                    <> · weighted {formatMoney(col.weightedValue)} ({col.stage.probability}%)</>
                  )}
                </p>
              </div>
              {col.items.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">Nothing here</p>
              ) : (
                <ul className="space-y-3">
                  {col.items.map((item) => (
                    <BoardCard key={item.id} item={item} stages={stages} today={today} />
                  ))}
                </ul>
              )}
              {col.truncated && (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Showing {col.items.length} of {col.count}. Use search to narrow down.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
