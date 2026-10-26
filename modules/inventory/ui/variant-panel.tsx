'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { addVariantAction, archiveVariantAction, restoreVariantAction, updateVariantAction } from '../actions';
import { ToggleButton } from './toggle-button';

export type VariantRow = {
  id: number;
  name: string | null;
  sku: string | null;
  isDefault: boolean;
  archived: boolean;
  salePrice: number | null;
  costPrice: number | null;
  stock: number;
  effectiveSalePrice: number;
  trackStock: boolean;
};

function VariantFields({ v }: { v?: VariantRow }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <div>
        <Label className="mb-1 text-xs">Name</Label>
        <Input name="name" defaultValue={v?.name ?? ''} maxLength={100} required disabled={v?.isDefault} placeholder={v?.isDefault ? 'Default variant' : 'e.g. Red / L'} />
      </div>
      <div>
        <Label className="mb-1 text-xs">SKU</Label>
        <Input name="sku" defaultValue={v?.sku ?? ''} maxLength={64} />
      </div>
      <div>
        <Label className="mb-1 text-xs">Sale price</Label>
        <Input name="salePrice" type="number" min="0" step="0.01" defaultValue={v?.salePrice ?? ''} placeholder="Product price" />
      </div>
      <div>
        <Label className="mb-1 text-xs">Cost price</Label>
        <Input name="costPrice" type="number" min="0" step="0.01" defaultValue={v?.costPrice ?? ''} placeholder="Product price" />
      </div>
    </div>
  );
}

function VariantForm({ productId, v }: { productId: number; v?: VariantRow }) {
  const [state, onSubmit, pending] = useKeepFormAction(v ? updateVariantAction : addVariantAction);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="productId" value={productId} />
      {v && <input type="hidden" name="id" value={v.id} />}
      {/* Kolom nama varian bawaan nonaktif (tidak terkirim); layanan mengabaikan namanya. */}
      {v?.isDefault && <input type="hidden" name="name" value="Default" />}
      <VariantFields v={v} />
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      {state.success && <p className="text-green-600 text-sm">{state.success}</p>}
      <Button type="submit" size="sm" variant={v ? 'outline' : 'default'} className={v ? '' : 'bg-orange-500 hover:bg-orange-600 text-white'} disabled={pending}>
        {v ? 'Save variant' : 'Add variant'}
      </Button>
    </form>
  );
}

export function VariantPanel({ productId, variants, productArchived, canArchive }: { productId: number; variants: VariantRow[]; productArchived: boolean; canArchive: boolean }) {
  return (
    <div className="space-y-4">
      <ul className="divide-y">
        {variants.map((v) => (
          <li key={v.id} className={`py-3 ${v.archived ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-gray-900">
                {v.name ?? 'Default'} {v.sku && <span className="text-sm font-normal text-muted-foreground">· {v.sku}</span>}
                {v.archived && <span className="ml-2 text-xs text-gray-500">(archived)</span>}
              </span>
              <span className="text-sm text-muted-foreground">
                {v.effectiveSalePrice.toLocaleString()} · {v.trackStock ? `${v.stock} in stock` : 'not tracked'}
              </span>
            </div>
            {!productArchived && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-orange-600">Edit</summary>
                <div className="mt-3 space-y-3">
                  <VariantForm productId={productId} v={v} />
                  {canArchive && !v.isDefault && (
                    <ToggleButton
                      id={v.id}
                      productId={productId}
                      archived={v.archived}
                      archiveAction={archiveVariantAction}
                      restoreAction={restoreVariantAction}
                      archiveLabel="Archive variant"
                      restoreLabel="Restore variant"
                      size="sm"
                    />
                  )}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>

      {!productArchived && (
        <div className="rounded-md border p-4">
          <h3 className="mb-3 text-sm font-medium">Add a variant</h3>
          <VariantForm productId={productId} />
        </div>
      )}
    </div>
  );
}
