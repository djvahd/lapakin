'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { archiveOpportunityAction, restoreOpportunityAction } from '../actions';

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function ActionForm({ id, action, label }: { id: number; action: FormAction; label: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pending}>{label}</Button>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}

// `key` berbeda memasang ulang form saat status berubah, sehingga tiap instans memegang aksi yang tetap
// (lihat modules/contacts/ui/archive-button.tsx untuk bug yang melatarbelakanginya).
export function ArchiveButton({ id, archived }: { id: number; archived: boolean }) {
  return archived ? (
    <ActionForm key="restore" id={id} action={restoreOpportunityAction} label="Restore opportunity" />
  ) : (
    <ActionForm key="archive" id={id} action={archiveOpportunityAction} label="Archive opportunity" />
  );
}
