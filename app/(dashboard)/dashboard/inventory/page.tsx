import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getTenantContext } from '@/lib/auth/tenant';
import { listHref, parseListParams } from '@/modules/inventory/form';
import { listProducts } from '@/modules/inventory/service';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const query = parseListParams(await searchParams);
  const result = await listProducts(ctx.teamId, query);

  // Halaman di luar jangkauan (mis. setelah filter): kembali ke halaman terakhir.
  if (result.items.length === 0 && result.total > 0) {
    redirect(listHref(query, { page: result.pageCount }));
  }

  const filtered = Boolean(query.q || query.lowStock || query.archived);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Inventory</h1>
        <Link href="/dashboard/inventory/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="mr-2 h-4 w-4" /> New product
          </Button>
        </Link>
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3" role="search">
        <Input name="q" defaultValue={query.q ?? ''} placeholder="Search name or SKU" aria-label="Search" className="max-w-xs" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="low" value="1" defaultChecked={query.lowStock} /> Low stock only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={query.archived} /> Show archived
        </label>
        <Button type="submit" variant="outline">Filter</Button>
        {filtered && (
          <Link href="/dashboard/inventory">
            <Button type="button" variant="ghost">Reset</Button>
          </Link>
        )}
      </form>

      <Card>
        <CardHeader>
          <CardTitle>
            {query.archived ? 'Archived products' : 'Products'}{' '}
            <span className="text-sm font-normal text-muted-foreground">({result.total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="mb-4 h-12 w-12 text-orange-500" />
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {filtered ? 'No products match your filters' : 'No products yet'}
              </h3>
              <p className="max-w-sm text-sm text-gray-500">
                {filtered ? 'Try a different search or reset the filters.' : 'Add the first product you sell.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {result.items.map((p) => (
                <li key={p.id} className="py-3">
                  <Link href={`/dashboard/inventory/${p.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span className={`text-sm ${p.low ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
                        {p.trackStock ? `${p.stock} ${p.unit}${p.low ? ' · low stock' : ''}` : 'Not tracked'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[p.sku, p.variantCount > 1 ? `${p.variantCount} variants` : null, p.salePrice.toLocaleString()]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              {result.page > 1 ? (
                <Link href={listHref(query, { page: result.page - 1 })} className="text-orange-600">← Previous</Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount ? (
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
