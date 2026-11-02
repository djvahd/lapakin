'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/components/ui/field';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';

export type InvoiceLineOption = {
  id: number;
  description: string;
  remaining: number;
  unitPrice: number;
  discountPct: number;
  // Jumlah yang sudah ada di faktur ini (saat mengubah draft); selain itu sisa penuh.
  quantity: number;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  orderId: number;
  invoiceId?: number;
  lines: InvoiceLineOption[];
  initial: { issueDate: string; dueDate: string; notes: string | null };
};

const lineTotal = (qty: number, price: number, disc: number) => Math.round(qty * price * (1 - disc / 100) * 100) / 100;

export function InvoiceForm({ action, submitLabel, orderId, invoiceId, lines, initial }: Props) {
  const [state, onSubmit, pending] = useKeepFormAction(action);
  const [qty, setQty] = useState<Record<number, number>>(() => Object.fromEntries(lines.map((l) => [l.id, l.quantity])));
  const total = lines.reduce((s, l) => s + lineTotal(qty[l.id] || 0, l.unitPrice, l.discountPct), 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="orderId" value={orderId} />
      {invoiceId && <input type="hidden" name="id" value={invoiceId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="issueDate" className="mb-2">Issue date</Label>
          <Input id="issueDate" name="issueDate" type="date" required defaultValue={initial.issueDate} />
        </div>
        <div>
          <Label htmlFor="dueDate" className="mb-2">Due date</Label>
          <Input id="dueDate" name="dueDate" type="date" required defaultValue={initial.dueDate} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Lines to invoice</h3>
        {lines.map((l) => (
          <div key={l.id} className="grid items-end gap-2 sm:grid-cols-12">
            <p className="text-sm sm:col-span-6">
              {l.description}{' '}
              <span className="text-muted-foreground">
                ({l.remaining} left · {l.unitPrice.toLocaleString()}
                {l.discountPct > 0 ? ` − ${l.discountPct}%` : ''})
              </span>
            </p>
            <div className="sm:col-span-3">
              <Label htmlFor={`qty-${l.id}`} className="mb-1 text-xs">Quantity</Label>
              <Input
                id={`qty-${l.id}`}
                name={`qty-${l.id}`}
                type="number"
                min="0"
                max={l.remaining}
                step="0.001"
                value={qty[l.id] ?? 0}
                disabled={l.remaining <= 0}
                onChange={(e) => setQty((q) => ({ ...q, [l.id]: Number(e.target.value) }))}
              />
            </div>
            <p className="pb-2 text-right text-sm tabular-nums sm:col-span-3">
              {lineTotal(qty[l.id] || 0, l.unitPrice, l.discountPct).toLocaleString()}
            </p>
          </div>
        ))}
        <p className="text-right text-sm font-medium">Total: {total.toLocaleString()}</p>
      </div>

      <div>
        <Label htmlFor="notes" className="mb-2">Notes</Label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} className={fieldClass} defaultValue={initial.notes ?? ''} />
      </div>

      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      {state.success && <p className="text-green-600 text-sm">{state.success}</p>}
      <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
