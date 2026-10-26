'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { completeActivityAction } from '../actions';

// Satu aksi yang tetap (tidak bergantian), jadi tidak butuh key seperti tombol arsip.
export function FollowUpDone({ id, opportunityId }: { id: number; opportunityId: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(completeActivityAction, {});
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Mark done</Button>
      {state.error && <p className="text-red-500 text-xs">{state.error}</p>}
    </form>
  );
}
