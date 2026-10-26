import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { listStageUsage } from '@/modules/crm/service';
import { StageManager } from '@/modules/crm/ui/stage-manager';

export default async function StagesPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const stages = await listStageUsage(ctx.teamId);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/crm" className="mb-4 inline-block text-sm text-orange-600">← CRM</Link>
      <h1 className="mb-2 text-lg lg:text-2xl font-medium text-gray-900">Pipeline stages</h1>
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Stages are the columns of your board. The probability of each open stage sets the weighted value of the opportunities in it.
        Won and Lost always stay at the end and cannot be deleted.
      </p>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <StageManager
            canManage={can(ctx.role, 'crm:stage-manage')}
            stages={stages.map((s) => ({
              id: s.id,
              name: s.name,
              kind: s.kind,
              probability: s.probability,
              opportunityCount: s.opportunityCount,
            }))}
          />
        </CardContent>
      </Card>
    </section>
  );
}
