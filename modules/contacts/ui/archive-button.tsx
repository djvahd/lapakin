'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { archiveContactAction, restoreContactAction } from '../actions';

export function ArchiveButton({ id, archived }: { id: number; archived: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    archived ? restoreContactAction : archiveContactAction,
    {}
  );

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pending}>
        {archived ? 'Restore contact' : 'Archive contact'}
      </Button>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}
