'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fieldClass } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ActionState } from '@/lib/auth/middleware';
import { useKeepFormAction } from '@/lib/use-keep-form-action';
import { createStageAction, deleteStageAction, moveStageAction, updateStageAction } from '../actions';

export type StageRowData = {
  id: number;
  name: string;
  kind: string;
  probability: number;
  opportunityCount: number;
};

const kindLabel: Record<string, string> = { won: 'Won (final)', lost: 'Lost (final)' };

// Tombol panah: aksinya selalu sama (moveStageAction), arah dikirim sebagai isian tersembunyi.
function ArrowButton({ id, direction, disabled }: { id: number; direction: 'up' | 'down'; disabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(moveStageAction, {});
  const Icon = direction === 'up' ? ArrowUp : ArrowDown;
  return (
    <form action={action} title={state.error}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={direction} />
      <Button type="submit" size="sm" variant="ghost" disabled={disabled || pending} aria-label={`Move ${direction}`}>
        <Icon className="h-4 w-4" />
      </Button>
    </form>
  );
}

function DeletePanel({ stage, others, onClose }: { stage: StageRowData; others: StageRowData[]; onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteStageAction, {});
  const needsTarget = stage.opportunityCount > 0;

  const confirm = (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(`Delete the stage "${stage.name}"?${needsTarget ? ` ${stage.opportunityCount} opportunit${stage.opportunityCount === 1 ? 'y' : 'ies'} will be moved.` : ''}`)) {
      e.preventDefault();
    }
  };

  return (
    <form action={action} onSubmit={confirm} className="mt-2 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
      <input type="hidden" name="id" value={stage.id} />
      {needsTarget && (
        <div>
          <label htmlFor={`moveTo-${stage.id}`} className="mb-1 block text-xs text-red-800">
            Move {stage.opportunityCount} opportunit{stage.opportunityCount === 1 ? 'y' : 'ies'} (including archived) to
          </label>
          <select id={`moveTo-${stage.id}`} name="moveTo" className={fieldClass} required defaultValue="">
            <option value="" disabled>Choose a stage</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="outline" className="text-red-600" disabled={pending}>Delete stage</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
    </form>
  );
}

function StageRow({
  stage,
  index,
  openCount,
  canManage,
  others,
}: {
  stage: StageRowData;
  index: number;
  openCount: number;
  canManage: boolean;
  others: StageRowData[];
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [state, onSubmit, pending] = useKeepFormAction(updateStageAction);
  const isOpen = stage.kind === 'open';

  // Tutup form hanya bila berhasil; bila gagal (mis. nama kembar) isian tetap ada.
  useEffect(() => {
    if (state.success) setEditing(false);
  }, [state]);

  return (
    <li className="space-y-2 py-3" data-stage-row={stage.name}>
      {editing ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="hidden" name="id" value={stage.id} />
          <Input name="name" defaultValue={stage.name} maxLength={50} required aria-label="Stage name" />
          {isOpen ? (
            <Input name="probability" defaultValue={String(stage.probability)} inputMode="numeric" className="sm:w-28" aria-label="Probability (%)" />
          ) : (
            <span className="text-sm text-muted-foreground sm:w-28">{stage.probability}% (fixed)</span>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={pending}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-medium text-gray-900">{stage.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {kindLabel[stage.kind] ?? `${stage.probability}%`} · {stage.opportunityCount} opportunit{stage.opportunityCount === 1 ? 'y' : 'ies'}
            </span>
          </div>
          {canManage && (
            <div className="flex items-center gap-1">
              {isOpen && (
                <>
                  <ArrowButton id={stage.id} direction="up" disabled={index === 0} />
                  <ArrowButton id={stage.id} direction="down" disabled={index === openCount - 1} />
                </>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
              {isOpen && openCount > 1 && (
                <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => setDeleting((v) => !v)}>Delete</Button>
              )}
            </div>
          )}
        </div>
      )}
      {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      {deleting && <DeletePanel stage={stage} others={others} onClose={() => setDeleting(false)} />}
    </li>
  );
}

export function StageManager({ stages, canManage }: { stages: StageRowData[]; canManage: boolean }) {
  const openCount = stages.filter((s) => s.kind === 'open').length;
  const [state, onSubmit, pending] = useKeepFormAction(createStageAction);
  const formRef = useRef<HTMLFormElement>(null);

  // Kosongkan form tambah hanya setelah berhasil.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-6">
      <ul className="divide-y">
        {stages.map((s, i) => (
          <StageRow
            key={`${s.id}:${s.name}:${s.probability}:${s.opportunityCount}`}
            stage={s}
            index={i}
            openCount={openCount}
            canManage={canManage}
            others={stages.filter((o) => o.id !== s.id)}
          />
        ))}
      </ul>

      {canManage ? (
        <form ref={formRef} onSubmit={onSubmit} className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Add a stage</p>
          <p className="text-xs text-muted-foreground">New stages are added before Won.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input name="name" placeholder="Stage name" maxLength={50} required aria-label="New stage name" />
            <Input name="probability" placeholder="Probability %" inputMode="numeric" className="sm:w-36" aria-label="New stage probability" />
            <Button type="submit" variant="outline" disabled={pending}>Add stage</Button>
          </div>
          {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only a team owner can change the pipeline stages.</p>
      )}
    </div>
  );
}
