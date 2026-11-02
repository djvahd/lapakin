'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/components/ui/field';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';

export type EventOption = { name: string; label: string; fields: string[] };

export type RuleFormValues = {
  id: number;
  name: string;
  event: string;
  conditions: { field: string; op: string; value: string | number | boolean }[];
  title: string;
  body: string | null;
  link: string | null;
  recipient: string;
  active: boolean;
};

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  events: EventOption[];
  initial?: RuleFormValues;
};

const OPS: [string, string][] = [
  ['eq', '='],
  ['neq', '≠'],
  ['gt', '>'],
  ['gte', '≥'],
  ['lt', '<'],
  ['lte', '≤'],
];

type Row = { key: number; field: string; op: string; value: string };

export function RuleForm({ action, submitLabel, events, initial }: Props) {
  const [state, onSubmit, pending] = useKeepFormAction(action);
  const [event, setEvent] = useState(initial?.event ?? events[0].name);
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.conditions ?? []).map((c, key) => ({ key, field: c.field, op: c.op, value: String(c.value) }))
  );
  const [nextKey, setNextKey] = useState(rows.length);
  const fields = events.find((e) => e.name === event)?.fields ?? [];

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="action" value="notify" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" className="mb-2">Name</Label>
          <Input id="name" name="name" maxLength={100} required defaultValue={initial?.name ?? ''} />
        </div>
        <div>
          <Label htmlFor="event" className="mb-2">When</Label>
          <select
            id="event"
            name="event"
            className={fieldClass}
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              // Bidang berbeda per peristiwa: kondisi lama tidak berlaku lagi.
              setRows([]);
            }}
          >
            {events.map((e) => (
              <option key={e.name} value={e.name}>{e.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Only if (all must match)</h3>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No conditions: the rule runs for every event.</p>}
        {rows.map((r, i) => (
          <div key={r.key} className="grid gap-2 sm:grid-cols-12">
            <select aria-label={`Condition ${i + 1} field`} name="condField" className={`${fieldClass} sm:col-span-5`} value={r.field} onChange={(e) => patch(r.key, { field: e.target.value })}>
              {fields.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select aria-label={`Condition ${i + 1} operator`} name="condOp" className={`${fieldClass} sm:col-span-2`} value={r.op} onChange={(e) => patch(r.key, { op: e.target.value })}>
              {OPS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <Input aria-label={`Condition ${i + 1} value`} name="condValue" className="sm:col-span-4" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} />
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove condition ${i + 1}`} className="sm:col-span-1" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setRows((rs) => [...rs, { key: nextKey, field: fields[0] ?? '', op: 'eq', value: '' }]);
            setNextKey(nextKey + 1);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Add condition
        </Button>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Then send a notification</h3>
        <p className="text-xs text-muted-foreground">
          Use {'{{field}}'} for values from the event: {fields.map((f) => `{{${f}}}`).join(', ')}.
        </p>
        <div>
          <Label htmlFor="title" className="mb-2">Title</Label>
          <Input id="title" name="title" maxLength={200} required defaultValue={initial?.title ?? ''} />
        </div>
        <div>
          <Label htmlFor="body" className="mb-2">Message</Label>
          <Input id="body" name="body" maxLength={500} defaultValue={initial?.body ?? ''} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="link" className="mb-2">Link (inside the app)</Label>
            <Input id="link" name="link" maxLength={300} placeholder="/dashboard/invoices/{{invoiceId}}" defaultValue={initial?.link ?? ''} />
          </div>
          <div>
            <Label htmlFor="recipient" className="mb-2">Send to</Label>
            <select id="recipient" name="recipient" className={fieldClass} defaultValue={initial?.recipient ?? 'owners'}>
              <option value="owners">Team owners</option>
              <option value="payload_user">The person the event is about</option>
            </select>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} /> Rule is active
      </label>

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
