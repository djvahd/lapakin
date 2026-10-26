import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { archiveProductAction, restoreProductAction, updateProductAction } from '@/modules/inventory/actions';
import { getProduct } from '@/modules/inventory/service';
import { ProductForm } from '@/modules/inventory/ui/product-form';
import { StockPanel } from '@/modules/inventory/ui/stock-panel';
import { ToggleButton } from '@/modules/inventory/ui/toggle-button';
import { VariantPanel } from '@/modules/inventory/ui/variant-panel';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const product = await getProduct(ctx.teamId, id);
  if (!product) notFound();

  const archived = product.archivedAt !== null;
  const canArchive = can(ctx.role, 'inventory:archive');
  const active = product.variants.filter((v) => !v.archivedAt);

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <Link href="/dashboard/inventory" className="mb-4 inline-block text-sm text-orange-600">← Inventory</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg lg:text-2xl font-medium text-gray-900">
            {product.name} {archived && <span className="text-sm font-normal text-gray-500">(archived)</span>}
          </h1>
          <p className={`text-sm ${product.low ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
            {product.trackStock ? `${product.stock} ${product.unit} in stock${product.low ? ' · low stock' : ''}` : 'Stock not tracked'}
          </p>
        </div>
      </div>

      {product.trackStock && !archived && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <StockPanel
              productId={product.id}
              canAdjust={can(ctx.role, 'inventory:adjust')}
              variants={active.map((v) => ({ id: v.id, label: `${v.name ?? 'Default'}${v.sku ? ` (${v.sku})` : ''} · ${v.stock}` }))}
            />
          </CardContent>
        </Card>
      )}

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <VariantPanel
            productId={product.id}
            productArchived={archived}
            canArchive={canArchive}
            variants={product.variants.map((v) => ({
              id: v.id,
              name: v.name,
              sku: v.sku,
              isDefault: v.isDefault,
              archived: v.archivedAt !== null,
              salePrice: v.salePrice,
              costPrice: v.costPrice,
              stock: v.stock,
              effectiveSalePrice: v.effectiveSalePrice,
              trackStock: product.trackStock,
            }))}
          />
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProductForm
            action={updateProductAction}
            submitLabel="Save product"
            disabled={archived}
            initial={{
              id: product.id,
              name: product.name,
              description: product.description,
              unit: product.unit,
              sku: product.variants.find((v) => v.isDefault)?.sku ?? null,
              salePrice: product.salePrice,
              costPrice: product.costPrice,
              trackStock: product.trackStock,
              reorderLevel: product.reorderLevel,
            }}
          />
          {canArchive && (
            <ToggleButton
              id={product.id}
              archived={archived}
              archiveAction={archiveProductAction}
              restoreAction={restoreProductAction}
              archiveLabel="Archive product"
              restoreLabel="Restore product"
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
