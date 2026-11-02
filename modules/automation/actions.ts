'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { parseRuleForm } from './form';
import { AutomationError, createRule, deleteRule, markRead, setRuleActive, updateRule } from './service';

// Seperti modul lain: form dibaca dari FormData sendiri (kolom kondisi berulang).
const anyForm = z.object({}).passthrough();

const failure = (e: unknown) => {
  if (e instanceof AutomationError) return { error: e.message };
  throw e;
};

const idOf = (formData: FormData, key = 'id') => {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refresh = (id?: number) => {
  revalidatePath('/dashboard/automation');
  if (id) revalidatePath(`/dashboard/automation/${id}`);
};

export const createRuleAction = validatedActionWithTenant(anyForm, 'automation:manage', async (_d, formData, ctx) => {
  const form = parseRuleForm(formData);
  if (!form.ok) return { error: form.error };
  let id: number;
  try {
    id = (await createRule({ teamId: ctx.teamId, userId: ctx.user.id }, form.data)).id;
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect(`/dashboard/automation/${id}`);
});

export const updateRuleAction = validatedActionWithTenant(anyForm, 'automation:manage', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Rule not found' };
  const form = parseRuleForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await updateRule({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Rule saved' };
});

const toggle = (active: boolean, done: string) =>
  validatedActionWithTenant(anyForm, 'automation:manage', async (_d, formData, ctx) => {
    const id = idOf(formData);
    if (!id) return { error: 'Rule not found' };
    try {
      await setRuleActive({ teamId: ctx.teamId, userId: ctx.user.id }, id, active);
    } catch (e) {
      return failure(e);
    }
    refresh(id);
    return { success: done };
  });

export const enableRuleAction = toggle(true, 'Rule enabled');
export const disableRuleAction = toggle(false, 'Rule disabled');

export const deleteRuleAction = validatedActionWithTenant(anyForm, 'automation:manage', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Rule not found' };
  try {
    await deleteRule({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect('/dashboard/automation');
});

// Tanpa id berarti semua notifikasi pengguna ini; hanya miliknya yang bisa ditandai.
export const markReadAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  await markRead(ctx.teamId, ctx.user.id, idOf(formData) ?? undefined);
  revalidatePath('/dashboard/notifications');
  return { success: 'Marked as read' };
});
