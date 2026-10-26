'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/components/ui/field';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';

export type ProductFormValues = {
  id: number;
  name: string;
  description: string | null;
  unit: string;
  sku: string | null;
  salePrice: number;
  costPrice: number;
  trackStock: boolean;
  reorderLevel: number | null;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initial?: ProductFormValues;
  disabled?: boolean;
};

export function ProductForm({ action, submitLabel, initial, disabled }: Props) {
  const [state, onSubmit, pending] = useKeepFormAction(action);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" className="mb-2">Name</Label>
          <Input id="name" name="name" defaultValue={initial?.name ?? ''} maxLength={200} required />
        </div>
        <div>
          <Label htmlFor="sku" className="mb-2">SKU</Label>
          <Input id="sku" name="sku" defaultValue={initial?.sku ?? ''} maxLength={64} />
        </div>
      </div>

      <div>
        <Label htmlFor="description" className="mb-2">Description</Label>
        <textarea id="description" name="description" rows={3} maxLength={2000} className={fieldClass} defaultValue={initial?.description ?? ''} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="unit" className="mb-2">Unit</Label>
          <Input id="unit" name="unit" defaultValue={initial?.unit ?? 'pcs'} maxLength={20} required />
        </div>
        <div>
          <Label htmlFor="salePrice" className="mb-2">Sale price</Label>
          <Input id="salePrice" name="salePrice" type="number" min="0" step="0.01" defaultValue={initial?.salePrice ?? 0} />
        </div>
        <div>
          <Label htmlFor="costPrice" className="mb-2">Cost price</Label>
          <Input id="costPrice" name="costPrice" type="number" min="0" step="0.01" defaultValue={initial?.costPrice ?? 0} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="trackStock" defaultChecked={initial?.trackStock ?? true} /> Track stock (untick for services)
        </label>
        <div>
          <Label htmlFor="reorderLevel" className="mb-2">Low-stock level</Label>
          <Input
            id="reorderLevel"
            name="reorderLevel"
            type="number"
            min="0"
            step="0.001"
            placeholder="Leave empty to skip alerts"
            defaultValue={initial?.reorderLevel ?? ''}
          />
        </div>
      </div>

      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      {state.success && <p className="text-green-600 text-sm">{state.success}</p>}

      <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending || disabled}>
        {pending ? (
          <>
            <Loader2 className="animate-spin mr-2 h-4 w-4" /> Saving...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
