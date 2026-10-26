'use client';

import { startTransition, useActionState } from 'react';
import type { ActionState } from '@/lib/auth/middleware';

// Pengganti useActionState + <form action>. React 19 mereset seluruh isian form begitu aksi
// selesai, termasuk saat validasi gagal, sehingga pengguna kehilangan semua yang sudah diketik.
// Di sini FormData dikirim dari onSubmit, jadi form tidak direset otomatis: isian tetap ada
// saat gagal. Form yang perlu dikosongkan setelah berhasil memanggil form.reset() sendiri.
export function useKeepFormAction(action: (prev: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return [state, onSubmit, pending] as const;
}
