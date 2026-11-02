'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/components/ui/field';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { recordPaymentAction } from '../actions';

export function PaymentPanel({ invoiceId, balance, today }: { invoiceId: number; balance: number; today: string }) {
  const [state, onSubmit, pending] = useKeepFormAction(recordPaymentAction);

  if (balance <= 0) return <p className="text-sm text-muted-foreground">This invoice is fully paid.</p>;

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div>
        <Label htmlFor="amount" className="mb-1 text-xs">Amount</Label>
        <Input id="amount" name="amount" type="number" min="0.01" max={balance} step="0.01" defaultValue={balance} required />
      </div>
      <div>
        <Label htmlFor="paidOn" className="mb-1 text-xs">Paid on</Label>
        <Input id="paidOn" name="paidOn" type="date" defaultValue={today} required />
      </div>
      <div>
        <Label htmlFor="method" className="mb-1 text-xs">Method</Label>
        <select id="method" name="method" className={fieldClass} defaultValue="transfer">
          <option value="transfer">Transfer</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <Label htmlFor="payment-note" className="mb-1 text-xs">Note</Label>
        <Input id="payment-note" name="note" maxLength={500} />
      </div>
      <div className="sm:col-span-4 flex items-center gap-4">
        <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending}>
          Record payment
        </Button>
        {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
        {state.success && <p className="text-green-600 text-sm">{state.success}</p>}
      </div>
    </form>
  );
}
