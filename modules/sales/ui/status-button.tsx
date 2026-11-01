'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';

type Props = {
  id: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  primary?: boolean;
};

// Tombol satu aksi (kirim, konfirmasi, tolak, batalkan). Status dokumen berubah setelah aksi,
// jadi halaman memasang ulang tombol lewat `key` status.
export function StatusButton({ id, action, label, primary }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant={primary ? 'default' : 'outline'}
        className={primary ? 'bg-orange-500 hover:bg-orange-600 text-white' : undefined}
        disabled={pending}
      >
        {label}
      </Button>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
    </form>
  );
}
