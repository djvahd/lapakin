'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { parseActivityForm, parseMoveForm, parseOpportunityForm } from './form';
import {
  CrmError,
  archiveOpportunity,
  completeActivity,
  createActivity,
  createOpportunity,
  moveOpportunity,
  reopenActivity,
  restoreOpportunity,
  updateOpportunity,
} from './service';

// Form CRM membaca FormData sendiri (form.ts), karena nilai uang, tanggal, dan id opsional
// tidak cocok dengan Object.fromEntries yang dipakai pembungkus.
const anyForm = z.object({}).passthrough();

const failure = (e: unknown) => {
  if (e instanceof CrmError) return { error: e.message };
  throw e;
};

const idOf = (formData: FormData, key = 'id') => {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refresh = (id?: number) => {
  revalidatePath('/dashboard/crm');
  if (id) revalidatePath(`/dashboard/crm/${id}`);
};

export const createOpportunityAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const form = parseOpportunityForm(formData);
  if (!form.ok) return { error: form.error };

  let id: number;
  try {
    id = (await createOpportunity({ teamId: ctx.teamId, userId: ctx.user.id }, form.data)).id;
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect(`/dashboard/crm/${id}`);
});

export const updateOpportunityAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Opportunity not found' };
  const form = parseOpportunityForm(formData);
  if (!form.ok) return { error: form.error };

  try {
    await updateOpportunity({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Opportunity saved' };
});

export const moveOpportunityAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Opportunity not found' };
  const form = parseMoveForm(formData);
  if (!form.ok) return { error: form.error };

  try {
    await moveOpportunity({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Stage updated' };
});

export const archiveOpportunityAction = validatedActionWithTenant(anyForm, 'crm:archive', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Opportunity not found' };
  try {
    await archiveOpportunity({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Opportunity archived' };
});

export const restoreOpportunityAction = validatedActionWithTenant(anyForm, 'crm:archive', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Opportunity not found' };
  try {
    await restoreOpportunity({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Opportunity restored' };
});

export const createActivityAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const form = parseActivityForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await createActivity({ teamId: ctx.teamId, userId: ctx.user.id }, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(form.data.opportunityId);
  return { success: 'Follow-up scheduled' };
});

export const completeActivityAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Follow-up not found' };
  try {
    await completeActivity({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh(idOf(formData, 'opportunityId') ?? undefined);
  return { success: 'Follow-up completed' };
});

export const reopenActivityAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Follow-up not found' };
  try {
    await reopenActivity({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh(idOf(formData, 'opportunityId') ?? undefined);
  return { success: 'Follow-up reopened' };
});
