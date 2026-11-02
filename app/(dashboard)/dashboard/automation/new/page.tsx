import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { createRuleAction } from '@/modules/automation/actions';
import { eventOptions } from '@/modules/automation/events';
import { RuleForm } from '@/modules/automation/ui/rule-form';

export default async function NewRulePage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');
  if (!can(ctx.role, 'automation:manage')) redirect('/dashboard/automation');

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/automation" className="mb-4 inline-block text-sm text-orange-600">← Automation</Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">New rule</h1>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <RuleForm action={createRuleAction} submitLabel="Create rule" events={eventOptions()} />
        </CardContent>
      </Card>
    </section>
  );
}
