import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldClass } from '@/components/ui/field';
import { getTenantContext } from '@/lib/auth/tenant';
import { formatNumber } from '@/modules/billing/audit-labels';
import { listHref, parseListParams } from '@/modules/billing/form';
import { listInvoices, receivablesSummary } from '@/modules/billing/service';
import { InvoiceBadge } from '@/modules/billing/ui/status-badge';
import { todayIn } from '@/modules/crm/format';

const FILTERS: [string, string][] = [
  ['', 'All invoices'],
  ['open', 'Open balance'],
  ['overdue', 'Overdue'],
  ['unpaid', 'Unpaid'],
  ['partial', 'Partially paid'],
  ['paid', 'Paid'],
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const today = todayIn();
  const query = parseListParams(await searchParams, today);
  const [result, summary] = await Promise.all([listInvoices(ctx.teamId, query), receivablesSummary(ctx.teamId, today)]);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  // Halaman di luar jangkauan (mis. setelah filter): kembali ke halaman terakhir.
  if (result.items.length === 0 && result.total > 0) redirect(listHref(query, { page: pageCount }));

  const filtered = Boolean(query.payment || query.contactId);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create an invoice from a confirmed order on the Sales page.</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="text-2xl font-medium">{summary.outstanding.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{summary.count} open {summary.count === 1 ? 'invoice' : 'invoices'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Overdue</p>
            <p className={`text-2xl font-medium ${summary.overdue > 0 ? 'text-red-600' : ''}`}>{summary.overdue.toLocaleString()}</p>
            {summary.overdue > 0 && (
              <Link href="/dashboard/invoices?payment=overdue" className="text-xs text-orange-600">View overdue →</Link>
            )}
          </CardContent>
        </Card>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3" role="search">
        <select name="payment" defaultValue={query.payment ?? ''} aria-label="Payment status" className={`${fieldClass} max-w-[12rem]`}>
          {FILTERS.map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        {query.contactId && <input type="hidden" name="contact" value={query.contactId} />}
        <Button type="submit" variant="outline">Filter</Button>
        {filtered && (
          <Link href="/dashboard/invoices">
            <Button type="button" variant="ghost">Reset</Button>
          </Link>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            Invoices <span className="text-sm font-normal text-muted-foreground">({result.total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="mb-4 h-12 w-12 text-orange-500" />
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {filtered ? 'No invoices match your filters' : 'No invoices yet'}
              </h3>
              <p className="max-w-sm text-sm text-gray-500">
                {filtered ? 'Try a different filter or reset it.' : 'Confirm an order in Sales, then create its invoice.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {result.items.map((i) => (
                <li key={i.id} className="py-3">
                  <Link href={`/dashboard/invoices/${i.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {formatNumber(i.number)} · {i.contactName ?? 'Unknown contact'}
                      </span>
                      <InvoiceBadge status={i.status} paymentStatus={i.paymentStatus} overdue={i.overdue} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Due {i.dueDate} · {i.total.toLocaleString()}
                      {i.status === 'issued' && i.balance > 0 ? ` · ${i.balance.toLocaleString()} left` : ''}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {pageCount > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              {result.page > 1 ? (
                <Link href={listHref(query, { page: result.page - 1 })} className="text-orange-600">← Previous</Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">Page {result.page} of {pageCount}</span>
              {result.page < pageCount ? (
                <Link href={listHref(query, { page: result.page + 1 })} className="text-orange-600">Next →</Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
