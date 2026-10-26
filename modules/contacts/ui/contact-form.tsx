'use client';

import { useActionState, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionState } from '@/lib/auth/middleware';
import type { ContactKind } from '../schema';
import type { TagSummary } from '../service';

export const fieldClass =
  'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

export type ContactFormValues = {
  id?: number;
  kind: ContactKind;
  name: string;
  companyId: number | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  tagIds: number[];
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  companies: { id: number; name: string }[];
  tags: TagSummary[];
  initial?: ContactFormValues;
};

export function ContactForm({ action, submitLabel, companies, tags, initial }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [kind, setKind] = useState<ContactKind>(initial?.kind ?? 'person');

  return (
    <form action={formAction} className="space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="kind" className="mb-2">Type</Label>
          <select
            id="kind"
            name="kind"
            className={fieldClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as ContactKind)}
          >
            <option value="person">Person</option>
            <option value="company">Company</option>
          </select>
        </div>
        <div>
          <Label htmlFor="name" className="mb-2">Name</Label>
          <Input id="name" name="name" defaultValue={initial?.name ?? ''} maxLength={200} required />
        </div>
      </div>

      {kind === 'person' && (
        <div>
          <Label htmlFor="companyId" className="mb-2">Company</Label>
          <select id="companyId" name="companyId" className={fieldClass} defaultValue={initial?.companyId ?? ''}>
            <option value="">No company</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email" className="mb-2">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={initial?.email ?? ''} maxLength={255} />
        </div>
        <div>
          <Label htmlFor="phone" className="mb-2">Phone</Label>
          <Input id="phone" name="phone" defaultValue={initial?.phone ?? ''} maxLength={50} />
        </div>
      </div>

      <div>
        <Label htmlFor="address" className="mb-2">Address</Label>
        <textarea id="address" name="address" rows={2} maxLength={1000} className={fieldClass} defaultValue={initial?.address ?? ''} />
      </div>

      <div>
        <Label htmlFor="notes" className="mb-2">Notes</Label>
        <textarea id="notes" name="notes" rows={3} maxLength={5000} className={fieldClass} defaultValue={initial?.notes ?? ''} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Relationship</legend>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isCustomer" defaultChecked={initial?.isCustomer} /> Customer
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isSupplier" defaultChecked={initial?.isSupplier} /> Supplier
          </label>
        </div>
      </fieldset>

      {tags.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {tags.map((t) => (
              <label key={t.id} className="flex items-center gap-2">
                <input type="checkbox" name="tagIds" value={t.id} defaultChecked={initial?.tagIds.includes(t.id)} /> {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      {state.success && <p className="text-green-600 text-sm">{state.success}</p>}

      <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending}>
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
