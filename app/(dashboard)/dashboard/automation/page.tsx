import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { EVENTS, type EventName } from '@/modules/automation/events';
import { listRules } from '@/modules/automation/service';

export default async function AutomationPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const rules = await listRules(ctx.teamId);
  const canManage = can(ctx.role, 'automation:manage');

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Automation</h1>
        {canManage && (
          <Link href="/dashboard/automation/new">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="mr-2 h-4 w-4" /> New rule
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Rules <span className="text-sm font-normal text-muted-foreground">({rules.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No rules yet. A rule sends a notification when something happens, for example when an invoice becomes overdue.
            </p>
          ) : (
            <ul className="divide-y">
              {rules.map((r) => (
                <li key={r.id} className="py-3">
                  <Link href={`/dashboard/automation/${r.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">{r.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                        {r.active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      When: {EVENTS[r.event as EventName]?.label ?? r.event}
                      {r.conditions.length > 0 ? ` · ${r.conditions.length} condition${r.conditions.length === 1 ? '' : 's'}` : ''}
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
