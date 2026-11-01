'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { createDeliveryAction } from '../actions';

type Line = { id: number; description: string; ordered: number; delivered: number };

export function DeliveryPanel({ orderId, lines }: { orderId: number; lines: Line[] }) {
  const [state, onSubmit, pending] = useKeepFormAction(createDeliveryAction);
  const open = lines.filter((l) => l.ordered - l.delivered > 0);

  if (open.length === 0) return <p className="text-sm text-muted-foreground">Everything has been delivered.</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      {open.map((l) => {
        const remaining = Math.round((l.ordered - l.delivered) * 1000) / 1000;
        return (
          <div key={l.id} className="grid items-end gap-2 sm:grid-cols-12">
            <p className="text-sm sm:col-span-8">
              {l.description}{' '}
              <span className="text-muted-foreground">({remaining} left of {l.ordered})</span>
            </p>
            <div className="sm:col-span-4">
              <Label htmlFor={`qty-${l.id}`} className="mb-1 text-xs">Deliver now</Label>
              <Input id={`qty-${l.id}`} name={`qty-${l.id}`} type="number" min="0" max={remaining} step="0.001" defaultValue={remaining} />
            </div>
          </div>
        );
      })}
      <div>
        <Label htmlFor="delivery-note" className="mb-1 text-xs">Note</Label>
        <Input id="delivery-note" name="note" maxLength={500} />
      </div>
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      {state.success && <p className="text-green-600 text-sm">{state.success}</p>}
      <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending}>
        Record delivery
      </Button>
    </form>
  );
}
