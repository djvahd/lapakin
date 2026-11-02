import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { listQuerySchema as contactsQuery } from '@/modules/contacts/schemas';
import { listContacts } from '@/modules/contacts/service';
import { listSaleOptions } from '@/modules/inventory/service';
import {
  cancelOrderAction,
  confirmOrderAction,
  markSentAction,
  rejectOrderAction,
  updateOrderAction,
} from '@/modules/sales/actions';
import { formatNumber } from '@/modules/sales/audit-labels';
import { formatNumber as invoiceNumber } from '@/modules/billing/audit-labels';
import { listQuerySchema as invoiceQuery } from '@/modules/billing/schemas';
import { listInvoices } from '@/modules/billing/service';
import { InvoiceBadge } from '@/modules/billing/ui/status-badge';
import { getOrder } from '@/modules/sales/service';
import { DeliveryPanel } from '@/modules/sales/ui/delivery-panel';
import { OrderForm } from '@/modules/sales/ui/order-form';
import { StatusBadge } from '@/modules/sales/ui/status-badge';
import { StatusButton } from '@/modules/sales/ui/status-button';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const order = await getOrder(ctx.teamId, id);
  if (!order) notFound();

  const editable = order.status === 'draft' || order.status === 'sent';
  const confirmed = order.status === 'confirmed';
  const canCancel = can(ctx.role, 'sales:cancel') && order.deliveries.length === 0;

  const invoices = confirmed
    ? await listInvoices(ctx.teamId, invoiceQuery.parse({ orderId: id, pageSize: 20 }))
    : null;

  const [contacts, options] = editable
    ? await Promise.all([listContacts(ctx.teamId, contactsQuery.parse({ pageSize: 100 })), listSaleOptions(ctx.teamId)])
    : [null, []];

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <Link href="/dashboard/sales" className="mb-4 inline-block text-sm text-orange-600">← Sales</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            {formatNumber(order.number)} · {order.contactName ?? 'Unknown contact'} <StatusBadge status={order.status} />
          </h1>
          {/* key: status berubah setelah aksi, jadi tombol dipasang ulang bersama statusnya. */}
          <div className="flex flex-wrap items-start gap-2" key={order.status}>
            {order.status === 'draft' && <StatusButton id={id} action={markSentAction} label="Mark as sent" />}
            {editable && <StatusButton id={id} action={confirmOrderAction} label="Confirm order" primary />}
            {editable && <StatusButton id={id} action={rejectOrderAction} label="Reject" />}
            {confirmed && canCancel && <StatusButton id={id} action={cancelOrderAction} label="Cancel order" />}
          </div>
        </div>
        {order.opportunityId && (
          <Link href={`/dashboard/crm/${order.opportunityId}`} className="mt-2 inline-block text-sm text-orange-600">
            View opportunity →
          </Link>
        )}
      </div>

      {editable && contacts ? (
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>Quotation</CardTitle>
          </CardHeader>
          <CardContent>
            <OrderForm
              action={updateOrderAction}
              submitLabel="Save quotation"
              contacts={contacts.items.map((c) => ({ id: c.id, name: c.name }))}
              options={options}
              initial={{
                id: order.id,
                contactId: order.contactId,
                opportunityId: order.opportunityId,
                issueDate: order.issueDate,
                validUntil: order.validUntil,
                notes: order.notes,
                lines: order.lines.map((l) => ({
                  variantId: l.variantId,
                  description: l.description,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                  discountPct: l.discountPct,
                })),
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {order.lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {l.description}{' '}
                    <span className="text-muted-foreground">
                      {l.quantity} × {l.unitPrice.toLocaleString()}
                      {l.discountPct > 0 ? ` − ${l.discountPct}%` : ''} · delivered {l.delivered}
                    </span>
                  </span>
                  <span className="tabular-nums">{l.total.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-right font-medium">Total: {order.total.toLocaleString()}</p>
            {order.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{order.notes}</p>}
          </CardContent>
        </Card>
      )}

      {invoices && (
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoices.items.length > 0 && (
              <ul className="divide-y text-sm">
                {invoices.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between py-2">
                    <Link href={`/dashboard/invoices/${i.id}`} className="text-orange-600">{invoiceNumber(i.number)}</Link>
                    <span className="flex items-center gap-3">
                      {i.total.toLocaleString()} <InvoiceBadge status={i.status} paymentStatus={i.paymentStatus} overdue={i.overdue} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/dashboard/invoices/new?order=${id}`} className="inline-block text-sm font-medium text-orange-600">
              + New invoice
            </Link>
          </CardContent>
        </Card>
      )}

      {confirmed && (
        <Card className="max-w-4xl">
          <CardHeader>
            <CardTitle>Deliveries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <DeliveryPanel
              orderId={order.id}
              lines={order.lines.map((l) => ({ id: l.id, description: l.description, ordered: l.quantity, delivered: l.delivered }))}
            />
            {order.deliveries.length > 0 && (
              <ul className="divide-y text-sm">
                {order.deliveries.map((d) => (
                  <li key={d.id} className="py-2">
                    {d.deliveredAt.toLocaleString()}
                    {d.note ? ` · ${d.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
