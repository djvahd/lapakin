'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/components/ui/field';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { adjustStockAction, issueStockAction, receiveStockAction } from '../actions';

type Mode = 'receive' | 'issue' | 'adjust';

const MODES: Record<Mode, { label: string; field: string; fieldLabel: string; submit: string; action: (p: ActionState, f: FormData) => Promise<ActionState> }> = {
  receive: { label: 'Receive', field: 'quantity', fieldLabel: 'Quantity received', submit: 'Receive stock', action: receiveStockAction },
  issue: { label: 'Issue', field: 'quantity', fieldLabel: 'Quantity issued', submit: 'Issue stock', action: issueStockAction },
  adjust: { label: 'Count', field: 'countedQuantity', fieldLabel: 'Counted quantity', submit: 'Set stock to count', action: adjustStockAction },
};

type VariantOption = { id: number; label: string };

function StockForm({ mode, productId, variants }: { mode: Mode; productId: number; variants: VariantOption[] }) {
  const m = MODES[mode];
  const [state, onSubmit, pending] = useKeepFormAction(m.action);

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="productId" value={productId} />
      <div>
        <Label htmlFor={`variant-${mode}`} className="mb-1 text-xs">Variant</Label>
        <select id={`variant-${mode}`} name="variantId" className={fieldClass} required>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`qty-${mode}`} className="mb-1 text-xs">{m.fieldLabel}</Label>
        <Input id={`qty-${mode}`} name={m.field} type="number" min={mode === 'adjust' ? '0' : '0.001'} step="0.001" required />
      </div>
      <div>
        <Label htmlFor={`note-${mode}`} className="mb-1 text-xs">Note</Label>
        <Input id={`note-${mode}`} name="note" maxLength={500} />
      </div>
      <div className="flex items-end">
        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending}>
          {m.submit}
        </Button>
      </div>
      <div className="sm:col-span-4">
        {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
        {state.success && <p className="text-green-600 text-sm">{state.success}</p>}
      </div>
    </form>
  );
}

export function StockPanel({ productId, variants, canAdjust }: { productId: number; variants: VariantOption[]; canAdjust: boolean }) {
  const [mode, setMode] = useState<Mode>('receive');
  const modes = (Object.keys(MODES) as Mode[]).filter((k) => k !== 'adjust' || canAdjust);

  if (variants.length === 0) return <p className="text-sm text-muted-foreground">No active variants to move stock for.</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist">
        {modes.map((k) => (
          <Button key={k} type="button" size="sm" variant={k === mode ? 'default' : 'outline'} onClick={() => setMode(k)} role="tab" aria-selected={k === mode}>
            {MODES[k].label}
          </Button>
        ))}
      </div>
      {/* key: tiap jenis memakai aksi sendiri, jadi form dipasang ulang saat berganti. */}
      <StockForm key={mode} mode={mode} productId={productId} variants={variants} />
    </div>
  );
}
