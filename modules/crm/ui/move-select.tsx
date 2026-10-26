'use client';

import { useActionState } from 'react';
import { fieldClass } from '@/components/ui/field';
import type { ActionState } from '@/lib/auth/middleware';
import { moveOpportunityAction } from '../actions';

type StageOption = { id: number; name: string; kind: string };

// Memindahkan peluang ke tahap lain lewat pilihan (tanpa seret-dan-lepas). Bila tujuannya tahap
// Lost, pengguna ditanya alasannya (boleh kosong); Batal mengembalikan pilihan ke tahap semula.
export function MoveSelect({
  opportunityId,
  currentStageId,
  stages,
  compact = false,
}: {
  opportunityId: number;
  currentStageId: number;
  stages: StageOption[];
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(moveOpportunityAction, {});

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const select = e.currentTarget;
    const form = select.form;
    if (!form) return;
    const reason = form.elements.namedItem('lostReason') as HTMLInputElement;
    if (select.selectedOptions[0]?.dataset.kind === 'lost') {
      const answer = window.prompt('Why was this opportunity lost? (optional)');
      if (answer === null) {
        select.value = String(currentStageId);
        return;
      }
      reason.value = answer;
    } else {
      reason.value = '';
    }
    form.requestSubmit();
  };

  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="id" value={opportunityId} />
      <input type="hidden" name="lostReason" defaultValue="" />
      {/* key: setelah halaman diperbarui dengan tahap baru, pilihan dipasang ulang dengan nilai baru. */}
      <select
        key={currentStageId}
        name="stageId"
        defaultValue={currentStageId}
        onChange={onChange}
        disabled={pending}
        aria-label="Stage"
        className={`${fieldClass} ${compact ? 'py-1 text-xs' : ''}`}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id} data-kind={s.kind}>
            {s.name}
          </option>
        ))}
      </select>
      {state.error && <p className="text-red-500 text-xs">{state.error}</p>}
    </form>
  );
}
