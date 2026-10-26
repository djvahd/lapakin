'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { archiveContactAction, restoreContactAction } from '../actions';

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function ActionForm({ id, action, label }: { id: number; action: FormAction; label: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pending}>
        {label}
      </Button>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}

// Satu useActionState yang berganti aksi pada instans yang sama membuat pengiriman kedua di
// halaman yang sama tidak sampai ke server (ditemukan di produksi: arsip, pulihkan, lalu arsip
// lagi tanpa memuat ulang). `key` berbeda memaksa React memasang ulang formnya setiap status
// berubah, sehingga tiap instans selalu memegang aksi yang tetap.
export function ArchiveButton({ id, archived }: { id: number; archived: boolean }) {
  return archived ? (
    <ActionForm key="restore" id={id} action={restoreContactAction} label="Restore contact" />
  ) : (
    <ActionForm key="archive" id={id} action={archiveContactAction} label="Archive contact" />
  );
}
