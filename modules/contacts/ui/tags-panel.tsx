'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionState } from '@/lib/auth/middleware';
import { createTagAction } from '../actions';

type Props = { tags: { id: number; name: string; contactCount: number }[] };

export function TagsPanel({ tags }: Props) {
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
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                {t.name} <span className="text-gray-400">({t.contactCount})</span>
              </li>
            ))}
          </ul>
        )}
        <form action={action} className="flex gap-2" key={tags.length}>
          <Input name="name" placeholder="New tag" maxLength={50} required aria-label="New tag name" />
          <Button type="submit" variant="outline" disabled={pending}>
            Add
          </Button>
        </form>
        {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
      </CardContent>
    </Card>
  );
}
