'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { markReadAction } from '../actions';

// Tanpa id menandai semua notifikasi pengguna sebagai dibaca.
export function MarkReadButton({ id, label }: { id?: number; label: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(markReadAction, {});
  return (
    <form action={formAction} className="inline">
      {id && <input type="hidden" name="id" value={id} />}
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {label}
      </Button>
      {state.error && <span className="ml-2 text-sm text-red-500">{state.error}</span>}
    </form>
  );
}
