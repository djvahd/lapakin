import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fieldClass } from '@/components/ui/field';
import { getTenantContext } from '@/lib/auth/tenant';
import { formatNumber } from '@/modules/sales/audit-labels';
import { listHref, parseListParams } from '@/modules/sales/form';
import { ORDER_STATUSES } from '@/modules/sales/schema';
import { listOrders } from '@/modules/sales/service';
import { StatusBadge } from '@/modules/sales/ui/status-badge';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const query = parseListParams(await searchParams);
  const result = await listOrders(ctx.teamId, query);
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));

  // Halaman di luar jangkauan (mis. setelah filter): kembali ke halaman terakhir.
  if (result.items.length === 0 && result.total > 0) {
    redirect(listHref(query, { page: pageCount }));
  }

  const filtered = Boolean(query.status || query.contactId);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Sales</h1>
        <Link href="/dashboard/sales/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="mr-2 h-4 w-4" /> New quotation
          </Button>
        </Link>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3" role="search">
        <select name="status" defaultValue={query.status ?? ''} aria-label="Status" className={`${fieldClass} max-w-[12rem]`}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        {query.contactId && <input type="hidden" name="contact" value={query.contactId} />}
        <Button type="submit" variant="outline">Filter</Button>
        {filtered && (
          <Link href="/dashboard/sales">
            <Button type="button" variant="ghost">Reset</Button>
          </Link>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            Quotations and orders <span className="text-sm font-normal text-muted-foreground">({result.total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="mb-4 h-12 w-12 text-orange-500" />
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {filtered ? 'Nothing matches your filters' : 'No quotations yet'}
              </h3>
              <p className="max-w-sm text-sm text-gray-500">
                {filtered ? 'Try a different status or reset the filters.' : 'Create the first quotation for a customer.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {result.items.map((o) => (
                <li key={o.id} className="py-3">
                  <Link href={`/dashboard/sales/${o.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {formatNumber(o.number)} · {o.contactName ?? 'Unknown contact'}
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {o.issueDate} · {o.total.toLocaleString()}
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
