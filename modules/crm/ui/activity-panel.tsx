'use client';

import { useActionState, useEffect, useRef } from 'react';
import { CheckSquare, Mail, Phone, Users, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { completeActivityAction, createActivityAction, reopenActivityAction } from '../actions';
import { formatDate, isOverdue } from '../format';

export type ActivityItem = {
  id: number;
  kind: string;
  summary: string;
  dueDate: string;
  doneAt: Date | string | null;
  assigneeName: string | null;
};

const ICONS: Record<string, LucideIcon> = { call: Phone, email: Mail, meeting: Users, todo: CheckSquare };
const LABELS: Record<string, string> = { call: 'Call', email: 'Email', meeting: 'Meeting', todo: 'To do' };

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function ToggleForm({
  id,
  opportunityId,
  action,
  label,
}: {
  id: number;
  opportunityId: number;
  action: FormAction;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>{label}</Button>
      {state.error && <p className="text-red-500 text-xs">{state.error}</p>}
    </form>
  );
}

function ActivityRow({ activity, opportunityId, today }: { activity: ActivityItem; opportunityId: number; today: string }) {
  const done = Boolean(activity.doneAt);
  const Icon = ICONS[activity.kind] ?? CheckSquare;
  const late = !done && isOverdue(activity.dueDate, today);

  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 ${done ? 'text-gray-300' : 'text-orange-500'}`} aria-label={LABELS[activity.kind]} />
        <div>
          <p className={`text-sm font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{activity.summary}</p>
          <p className={`text-xs ${late ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
            {done ? 'Done' : late ? 'Overdue' : 'Due'} · {formatDate(activity.dueDate)}
            {activity.assigneeName ? ` · ${activity.assigneeName}` : ''}
          </p>
        </div>
      </div>
      {/* key berbeda: aksi tidak boleh berganti pada instans yang sama (lihat modules/contacts/ui/archive-button.tsx). */}
      {done ? (
        <ToggleForm key="reopen" id={activity.id} opportunityId={opportunityId} action={reopenActivityAction} label="Reopen" />
      ) : (
        <ToggleForm key="complete" id={activity.id} opportunityId={opportunityId} action={completeActivityAction} label="Mark done" />
      )}
    </li>
  );
}

type Props = {
  opportunityId: number;
  activities: ActivityItem[];
  members: { id: number; label: string }[];
  currentUserId: number;
  today: string;
  // false untuk peluang terarsip: tindak lanjut baru tidak bisa dijadwalkan.
  canSchedule: boolean;
};

export function ActivityPanel({ opportunityId, activities, members, currentUserId, today, canSchedule }: Props) {
  const [state, onSubmit, pending] = useKeepFormAction(createActivityAction);
  const formRef = useRef<HTMLFormElement>(null);

  // Kosongkan form hanya setelah berhasil; bila gagal, isian tetap ada.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-4">
      {activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No follow-ups yet.</p>
      ) : (
        <ul className="divide-y">
          {activities.map((a) => (
            <ActivityRow key={a.id} activity={a} opportunityId={opportunityId} today={today} />
          ))}
        </ul>
      )}

      {canSchedule && (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-3 rounded-md border p-3">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <p className="text-sm font-medium">Schedule a follow-up</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <select name="kind" aria-label="Type" className={fieldClass} defaultValue="call">
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
              <option value="todo">To do</option>
            </select>
            <Input name="summary" placeholder="What needs to happen?" maxLength={200} required aria-label="Summary" className="sm:col-span-2" />
            <Input name="dueDate" type="date" defaultValue={today} required aria-label="Due date" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select name="assignedTo" aria-label="Assigned to" className={`${fieldClass} sm:w-56`} defaultValue={currentUserId}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <Button type="submit" variant="outline" disabled={pending}>Add follow-up</Button>
          </div>
          {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
