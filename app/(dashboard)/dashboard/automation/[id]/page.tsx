import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { deleteRuleAction, disableRuleAction, enableRuleAction, updateRuleAction } from '@/modules/automation/actions';
import { eventOptions } from '@/modules/automation/events';
import { getRule, listRuns } from '@/modules/automation/service';
import { RuleForm } from '@/modules/automation/ui/rule-form';
import { StatusButton } from '@/modules/sales/ui/status-button';

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const rule = await getRule(ctx.teamId, id);
  if (!rule) notFound();

  const canManage = can(ctx.role, 'automation:manage');
  const runs = await listRuns(ctx.teamId, { ruleId: id, limit: 20 });
  const config = rule.actionConfig as { title?: string; body?: string | null; link?: string | null; recipient?: string };

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <Link href="/dashboard/automation" className="mb-4 inline-block text-sm text-orange-600">← Automation</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            {rule.name}{' '}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rule.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
              {rule.active ? 'Active' : 'Disabled'}
            </span>
          </h1>
          {canManage && (
            // key: status berubah setelah aksi, jadi tombol dipasang ulang bersama statusnya.
            <div className="flex flex-wrap items-start gap-2" key={String(rule.active)}>
              {rule.active ? (
                <StatusButton id={id} action={disableRuleAction} label="Disable" />
              ) : (
                <StatusButton id={id} action={enableRuleAction} label="Enable" />
              )}
              <StatusButton id={id} action={deleteRuleAction} label="Delete rule" />
            </div>
          )}
        </div>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Rule</CardTitle>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <RuleForm
              action={updateRuleAction}
              submitLabel="Save rule"
              events={eventOptions()}
              initial={{
                id: rule.id,
                name: rule.name,
                event: rule.event,
                conditions: rule.conditions,
                title: config.title ?? '',
                body: config.body ?? null,
                link: config.link ?? null,
                recipient: config.recipient ?? 'owners',
                active: rule.active,
              }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Only a team owner can change automation rules.</p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This rule has not run yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {r.createdAt.toLocaleString()}
                    {r.error ? <span className="text-red-600"> · {r.error}</span> : null}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'ok' ? 'bg-green-100 text-green-700' : r.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
