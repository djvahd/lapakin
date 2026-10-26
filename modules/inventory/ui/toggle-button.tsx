'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

type Props = {
  id: number;
  productId?: number;
  archived: boolean;
  archiveAction: FormAction;
  restoreAction: FormAction;
  archiveLabel: string;
  restoreLabel: string;
  size?: 'sm' | 'default';
};

function ActionForm({ id, productId, action, label, size }: { id: number; productId?: number; action: FormAction; label: string; size?: 'sm' | 'default' }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      {productId && <input type="hidden" name="productId" value={productId} />}
      <Button type="submit" variant="outline" size={size} disabled={pending}>
        {label}
      </Button>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}

// `key` berbeda memaksa React memasang ulang form saat status arsip berganti
// (alasan sama dengan ArchiveButton di modul Kontak).
export function ToggleButton({ archived, archiveAction, restoreAction, archiveLabel, restoreLabel, ...rest }: Props) {
  return archived ? (
    <ActionForm key="restore" action={restoreAction} label={restoreLabel} {...rest} />
  ) : (
    <ActionForm key="archive" action={archiveAction} label={archiveLabel} {...rest} />
  );
}
