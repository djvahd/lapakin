'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/components/ui/field';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';

export type LineValues = {
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPct: number;
};

export type OrderFormValues = {
  id: number;
  contactId: number;
  opportunityId: number | null;
  issueDate: string;
  validUntil: string | null;
  notes: string | null;
  lines: LineValues[];
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  contacts: { id: number; name: string }[];
  options: { variantId: number; label: string; price: number }[];
  initial?: OrderFormValues;
  // Nilai awal untuk penawaran baru (mis. dari peluang CRM).
  preset?: { contactId?: number | null; opportunityId?: number | null; today: string };
};

type Row = { key: number; values: LineValues };

const blank = (): LineValues => ({ variantId: null, description: '', quantity: 1, unitPrice: 0, discountPct: 0 });
const lineTotal = (l: LineValues) => Math.round(l.quantity * l.unitPrice * (1 - l.discountPct / 100) * 100) / 100;

export function OrderForm({ action, submitLabel, contacts, options, initial, preset }: Props) {
  const [state, onSubmit, pending] = useKeepFormAction(action);
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.lines.length ? initial.lines : [blank()]).map((values, key) => ({ key, values }))
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const patch = (key: number, p: Partial<LineValues>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, values: { ...r.values, ...p } } : r)));

  // Memilih produk mengisi deskripsi dan harga; keduanya tetap bisa diubah.
  const pick = (key: number, variantId: number | null) => {
    const o = options.find((x) => x.variantId === variantId);
    patch(key, o ? { variantId, description: o.label, unitPrice: o.price } : { variantId: null });
  };

  const total = rows.reduce((s, r) => s + lineTotal(r.values), 0);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="opportunityId" value={initial?.opportunityId ?? preset?.opportunityId ?? ''} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="contactId" className="mb-2">Customer</Label>
          <select id="contactId" name="contactId" className={fieldClass} required defaultValue={initial?.contactId ?? preset?.contactId ?? ''}>
            <option value="" disabled>Choose a contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="issueDate" className="mb-2">Issue date</Label>
          <Input id="issueDate" name="issueDate" type="date" required defaultValue={initial?.issueDate ?? preset?.today} />
        </div>
        <div>
          <Label htmlFor="validUntil" className="mb-2">Valid until</Label>
          <Input id="validUntil" name="validUntil" type="date" defaultValue={initial?.validUntil ?? ''} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Lines</h3>
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 rounded-md border p-3 sm:grid-cols-12">
            <input type="hidden" name="variantId" value={r.values.variantId ?? ''} />
            <div className="sm:col-span-3">
              <Label htmlFor={`product-${r.key}`} className="mb-1 text-xs">Product</Label>
              <select
                id={`product-${r.key}`}
                className={fieldClass}
                value={r.values.variantId ?? ''}
                onChange={(e) => pick(r.key, e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Free line</option>
                {options.map((o) => (
                  <option key={o.variantId} value={o.variantId}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor={`desc-${r.key}`} className="mb-1 text-xs">Description</Label>
              <Input id={`desc-${r.key}`} name="description" maxLength={300} value={r.values.description} onChange={(e) => patch(r.key, { description: e.target.value })} />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor={`qty-${r.key}`} className="mb-1 text-xs">Qty</Label>
              <Input id={`qty-${r.key}`} name="quantity" type="number" min="0.001" step="0.001" value={r.values.quantity} onChange={(e) => patch(r.key, { quantity: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`price-${r.key}`} className="mb-1 text-xs">Unit price</Label>
              <Input id={`price-${r.key}`} name="unitPrice" type="number" min="0" step="0.01" value={r.values.unitPrice} onChange={(e) => patch(r.key, { unitPrice: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor={`disc-${r.key}`} className="mb-1 text-xs">Disc %</Label>
              <Input id={`disc-${r.key}`} name="discountPct" type="number" min="0" max="100" step="0.01" value={r.values.discountPct} onChange={(e) => patch(r.key, { discountPct: Number(e.target.value) })} />
            </div>
            <div className="flex items-end justify-between gap-2 sm:col-span-2">
              <span className="pb-2 text-sm tabular-nums">{lineTotal(r.values).toLocaleString()}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove line ${i + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRows((rs) => [...rs, { key: nextKey, values: blank() }]);
              setNextKey(nextKey + 1);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Add line
          </Button>
          <p className="text-sm font-medium">Total: {total.toLocaleString()}</p>
        </div>
      </div>

      <div>
        <Label htmlFor="notes" className="mb-2">Notes</Label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} className={fieldClass} defaultValue={initial?.notes ?? ''} />
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
