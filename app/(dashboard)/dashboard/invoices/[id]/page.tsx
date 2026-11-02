import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { issueInvoiceAction, updateInvoiceAction, voidInvoiceAction } from '@/modules/billing/actions';
import { formatNumber } from '@/modules/billing/audit-labels';
import { getInvoice, getInvoiceableLines } from '@/modules/billing/service';
import { InvoiceForm } from '@/modules/billing/ui/invoice-form';
import { PaymentPanel } from '@/modules/billing/ui/payment-panel';
import { InvoiceBadge } from '@/modules/billing/ui/status-badge';
import { todayIn } from '@/modules/crm/format';
import { formatNumber as orderNumber } from '@/modules/sales/audit-labels';
import { StatusButton } from '@/modules/sales/ui/status-button';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const today = todayIn();
  const inv = await getInvoice(ctx.teamId, id, today);
  if (!inv) notFound();

  const draft = inv.status === 'draft';
  const issued = inv.status === 'issued';
  const canVoid = can(ctx.role, 'invoice:void') && inv.payments.length === 0 && inv.status !== 'void';

  // Form ubah draft: sisa yang bisa ditagih ditambah jumlah yang sudah ada di faktur ini.
  const editData = draft ? await getInvoiceableLines(ctx.teamId, inv.orderId) : null;
  const own = new Map(inv.lines.map((l) => [l.orderLineId, l.quantity]));

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <Link href="/dashboard/invoices" className="mb-4 inline-block text-sm text-orange-600">← Invoices</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            {formatNumber(inv.number)} · {inv.contactName ?? 'Unknown contact'}{' '}
            <InvoiceBadge status={inv.status} paymentStatus={inv.paymentStatus} overdue={inv.overdue} />
          </h1>
          {/* key: status berubah setelah aksi, jadi tombol dipasang ulang bersama statusnya. */}
          <div className="flex flex-wrap items-start gap-2" key={inv.status}>
            {draft && <StatusButton id={id} action={issueInvoiceAction} label="Issue invoice" primary />}
            {inv.status !== 'draft' && (
              <Link href={`/dashboard/invoices/${id}/print`} className="inline-flex h-9 items-center rounded-md border px-4 text-sm">
                Print / PDF
              </Link>
            )}
            {canVoid && <StatusButton id={id} action={voidInvoiceAction} label="Void invoice" />}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Order{' '}
          {inv.orderNumber !== null ? (
            <Link href={`/dashboard/sales/${inv.orderId}`} className="text-orange-600">{orderNumber(inv.orderNumber)}</Link>
          ) : (
            '—'
          )}{' '}
          · issued {inv.issueDate} · due {inv.dueDate}
        </p>
      </div>

      {draft && editData ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Invoice</CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceForm
              action={updateInvoiceAction}
              submitLabel="Save invoice"
              orderId={inv.orderId}
              invoiceId={id}
              lines={editData.lines.map((l) => {
                const mine = own.get(l.id) ?? 0;
                return { ...l, remaining: Math.round((l.remaining + mine) * 1000) / 1000, quantity: mine };
              })}
              initial={{ issueDate: inv.issueDate, dueDate: inv.dueDate, notes: inv.notes }}
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {inv.lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {l.description}{' '}
                    <span className="text-muted-foreground">
                      {l.quantity} × {l.unitPrice.toLocaleString()}
                      {l.discountPct > 0 ? ` − ${l.discountPct}%` : ''}
                    </span>
                  </span>
                  <span className="tabular-nums">{l.total.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-right font-medium">Total: {inv.total.toLocaleString()}</p>
            {inv.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{inv.notes}</p>}
          </CardContent>
        </Card>
      )}

      {(issued || inv.payments.length > 0) && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>
              Payments{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {inv.paid.toLocaleString()} paid · {inv.balance.toLocaleString()} left
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {issued && <PaymentPanel invoiceId={id} balance={inv.balance} today={today} />}
            {inv.payments.length > 0 && (
              <ul className="divide-y text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {p.paidOn} · {p.method}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                    <span className="tabular-nums">{p.amount.toLocaleString()}</span>
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
