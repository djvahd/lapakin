import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { listQuerySchema as contactsQuery } from '@/modules/contacts/schemas';
import { listContacts } from '@/modules/contacts/service';
import { listSaleOptions } from '@/modules/inventory/service';
import { createOrderAction } from '@/modules/sales/actions';
import { OrderForm } from '@/modules/sales/ui/order-form';

export default async function NewQuotationPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const [contacts, options] = await Promise.all([
    listContacts(ctx.teamId, contactsQuery.parse({ pageSize: 100 })),
    listSaleOptions(ctx.teamId),
  ]);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href="/dashboard/sales" className="mb-4 inline-block text-sm text-orange-600">← Sales</Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">New quotation</h1>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderForm
            action={createOrderAction}
            submitLabel="Create quotation"
            contacts={contacts.items.map((c) => ({ id: c.id, name: c.name }))}
            options={options}
            preset={{ today: new Date().toISOString().slice(0, 10) }}
          />
        </CardContent>
      </Card>
    </section>
  );
}
