import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { movementQuerySchema } from '@/modules/inventory/schemas';
import { getProduct, listMovements } from '@/modules/inventory/service';
import { MovementList } from '@/modules/inventory/ui/movement-list';

const positiveInt = (v: string | string[] | undefined) => {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const sp = await searchParams;
  const query = movementQuerySchema.parse({ productId: positiveInt(sp.product), page: positiveInt(sp.page) ?? 1 });
  const product = query.productId ? await getProduct(ctx.teamId, query.productId) : null;
  if (query.productId && !product) notFound();

  const result = await listMovements(ctx.teamId, query);
  if (result.items.length === 0 && result.total > 0) {
    redirect(`/dashboard/inventory/movements?${new URLSearchParams({ ...(query.productId ? { product: String(query.productId) } : {}), page: String(result.pageCount) })}`);
  }

  const href = (page: number) =>
    `/dashboard/inventory/movements?${new URLSearchParams({ ...(query.productId ? { product: String(query.productId) } : {}), ...(page > 1 ? { page: String(page) } : {}) })}`;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <Link href={product ? `/dashboard/inventory/${product.id}` : '/dashboard/inventory'} className="mb-4 inline-block text-sm text-orange-600">
        ← {product ? product.name : 'Inventory'}
      </Link>
      <h1 className="mb-6 text-lg lg:text-2xl font-medium text-gray-900">Stock history{product ? `: ${product.name}` : ''}</h1>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>
            Movements <span className="text-sm font-normal text-muted-foreground">({result.total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MovementList items={result.items} showProduct={!product} />
          {result.pageCount > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              {result.page > 1 ? <Link href={href(result.page - 1)} className="text-orange-600">← Newer</Link> : <span />}
              <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount ? <Link href={href(result.page + 1)} className="text-orange-600">Older →</Link> : <span />}
            </nav>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
