'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionState } from '@/lib/auth/middleware';
import { createTagAction, deleteTagAction, updateTagAction } from '../actions';
import { TAG_COLORS } from '../tag-colors';
import { TagChip } from './badges';
import { fieldClass } from './contact-form';

type Tag = { id: number; name: string; color: string | null; contactCount: number };

function ColorSelect({ value, onChange }: { value?: string; onChange?: (v: string) => void }) {
  const controlled = value !== undefined;
  return (
    <select
      name="color"
      {...(controlled ? { value, onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) } : { defaultValue: '' })}
      className={`${fieldClass} sm:w-32`}
      aria-label="Color"
    >
      <option value="">No color</option>
      {TAG_COLORS.map((c) => (
        <option key={c.hex} value={c.hex}>{c.name}</option>
      ))}
    </select>
  );
}

function TagRow({ tag, canManage }: { tag: Tag; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? '');
  const [saveState, saveAction, saving] = useActionState<ActionState, FormData>(updateTagAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<ActionState, FormData>(deleteTagAction, {});

  // Tutup form hanya bila berhasil; bila gagal (mis. nama kembar) isian tetap ada.
  useEffect(() => {
    if (saveState.success) setEditing(false);
  }, [saveState]);

  const confirmDelete = (e: React.FormEvent<HTMLFormElement>) => {
    const msg =
      tag.contactCount > 0
        ? `Delete the tag "${tag.name}"? It will be removed from ${tag.contactCount} contact(s). The contacts are kept.`
        : `Delete the tag "${tag.name}"?`;
    if (!window.confirm(msg)) e.preventDefault();
  };

  if (editing) {
    return (
      <li className="space-y-2">
        <form action={saveAction} className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={tag.id} />
          {/* Terkontrol: React 19 mereset isian tak terkontrol setelah aksi, termasuk saat gagal. */}
          <Input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required aria-label="Tag name" />
          <ColorSelect value={color} onChange={setColor} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={saving}>Save</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setName(tag.name); setColor(tag.color ?? ''); setEditing(false); }}>Cancel</Button>
          </div>
        </form>
        {saveState.error && <p className="text-red-500 text-sm">{saveState.error}</p>}
      </li>
    );
  }

  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <TagChip tag={tag} />
          <span className="text-xs text-muted-foreground">{tag.contactCount} contact{tag.contactCount === 1 ? '' : 's'}</span>
        </span>
        {canManage && (
          <span className="flex items-center gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
            <form action={deleteAction} onSubmit={confirmDelete}>
              <input type="hidden" name="id" value={tag.id} />
              <Button type="submit" size="sm" variant="ghost" className="text-red-600" disabled={deleting}>Delete</Button>
            </form>
          </span>
        )}
      </div>
      {(saveState.error || deleteState.error) && <p className="text-red-500 text-sm">{saveState.error ?? deleteState.error}</p>}
    </li>
  );
}

export function TagsPanel({ tags, canManage }: { tags: Tag[]; canManage: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTagAction, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet. Add one to group your contacts.</p>
        ) : (
          <ul className="space-y-3">
            {tags.map((t) => (
              <TagRow key={`${t.id}:${t.name}:${t.color}`} tag={t} canManage={canManage} />
            ))}
          </ul>
        )}
        {!canManage && tags.length > 0 && (
          <p className="text-xs text-muted-foreground">Only a team owner can rename or delete tags.</p>
        )}
        <form action={action} className="flex flex-col gap-2 sm:flex-row" key={tags.length}>
          <Input name="name" placeholder="New tag" maxLength={50} required aria-label="New tag name" />
          <ColorSelect />
          <Button type="submit" variant="outline" disabled={pending}>Add</Button>
        </form>
        {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
