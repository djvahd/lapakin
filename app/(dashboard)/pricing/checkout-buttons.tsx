'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { checkoutAction } from '@/lib/payments/actions';

type Props = { plan: string; monthLabel: string; yearLabel: string };

// Dua tombol, satu per periode; keduanya mengirim form yang sama dengan nilai `period` berbeda.
export function CheckoutButtons({ plan, monthLabel, yearLabel }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(checkoutAction, {});

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="plan" value={plan} />
      <Button type="submit" name="period" value="month" disabled={pending} className="w-full rounded-full bg-orange-500 hover:bg-orange-600 text-white">
        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {monthLabel}
      </Button>
      <Button type="submit" name="period" value="year" disabled={pending} variant="outline" className="w-full rounded-full">
        {yearLabel}
      </Button>
      {state.error && <p className="text-sm text-red-500">{state.error}</p>}
    </form>
  );
}
