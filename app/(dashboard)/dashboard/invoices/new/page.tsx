import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { createInvoiceAction } from '@/modules/billing/actions';
import { formatNumber as orderNumber } from '@/modules/sales/audit-labels';
import { getInvoiceableLines } from '@/modules/billing/service';
import { InvoiceForm } from '@/modules/billing/ui/invoice-form';
import { todayIn } from '@/modules/crm/format';

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const raw = (await searchParams).order;
  const orderId = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  const data = await getInvoiceableLines(ctx.teamId, orderId);
  if (!data) notFound();

  const today = todayIn();
  const open = data.lines.some((l) => l.remaining > 0);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href={`/dashboard/sales/${orderId}`} className="mb-4 inline-block text-sm text-orange-600">
        ← Order {orderNumber(data.order.number)}
      </Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">
        New invoice for {data.order.contactName ?? 'customer'}
      </h1>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {open ? (
            <InvoiceForm
              action={createInvoiceAction}
              submitLabel="Create invoice"
              orderId={orderId}
              lines={data.lines.map((l) => ({ ...l, quantity: l.remaining }))}
              initial={{ issueDate: today, dueDate: addDays(today, 14), notes: null }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Every line of this order has already been invoiced.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
