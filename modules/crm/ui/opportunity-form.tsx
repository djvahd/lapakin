'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { PRIORITY_LABELS } from '../format';

export type OpportunityFormValues = {
  id?: number;
  title: string;
  contactId: number | null;
  stageId?: number;
  expectedValue: number;
  expectedCloseDate: string | null;
  priority: number;
  ownerId: number | null;
  notes: string | null;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  contacts: { id: number; name: string }[];
  members: { id: number; label: string }[];
  // Hanya untuk membuat: tahap awal. Mengubah tahap peluang yang ada lewat MoveSelect.
  stages?: { id: number; name: string }[];
  initial?: OpportunityFormValues;
};

export function OpportunityForm({ action, submitLabel, contacts, members, stages, initial }: Props) {
  const [state, onSubmit, pending] = useKeepFormAction(action);

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

      <div>
        <Label htmlFor="title" className="mb-2">Title</Label>
        <Input id="title" name="title" defaultValue={initial?.title ?? ''} maxLength={200} required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contactId" className="mb-2">Contact</Label>
          <select id="contactId" name="contactId" className={fieldClass} defaultValue={initial?.contactId ?? ''}>
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ownerId" className="mb-2">Owner</Label>
          <select id="ownerId" name="ownerId" className={fieldClass} defaultValue={initial?.ownerId ?? ''}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="expectedValue" className="mb-2">Expected value (IDR)</Label>
          <Input
            id="expectedValue"
            name="expectedValue"
            inputMode="decimal"
            placeholder="0"
            defaultValue={initial ? String(initial.expectedValue) : ''}
          />
        </div>
        <div>
          <Label htmlFor="expectedCloseDate" className="mb-2">Expected close</Label>
          <Input id="expectedCloseDate" name="expectedCloseDate" type="date" defaultValue={initial?.expectedCloseDate ?? ''} />
        </div>
        <div>
          <Label htmlFor="priority" className="mb-2">Priority</Label>
          <select id="priority" name="priority" className={fieldClass} defaultValue={initial?.priority ?? 0}>
            {PRIORITY_LABELS.map((label, i) => (
              <option key={label} value={i}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {stages && (
        <div>
          <Label htmlFor="stageId" className="mb-2">Stage</Label>
          <select id="stageId" name="stageId" className={fieldClass} defaultValue={initial?.stageId ?? stages[0]?.id}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <Label htmlFor="notes" className="mb-2">Notes</Label>
        <textarea id="notes" name="notes" rows={3} maxLength={5000} className={fieldClass} defaultValue={initial?.notes ?? ''} />
      </div>

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
