'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { parseContactForm } from './form';
import { tagInputSchema } from './schemas';
import {
  ContactError,
  archiveContact,
  createContact,
  createTag,
  deleteTag,
  restoreContact,
  updateContact,
  updateTag,
} from './service';

// Form kontak membaca FormData sendiri (parseContactForm), karena tagIds berulang dan
// checkbox tidak cocok dengan Object.fromEntries yang dipakai pembungkus.
const anyForm = z.object({}).passthrough();

const failure = (e: unknown) => {
  if (e instanceof ContactError) return { error: e.message };
  throw e;
};

const idOf = (formData: FormData) => {
  const n = Number(formData.get('id'));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refresh = (id?: number) => {
  revalidatePath('/dashboard/contacts');
  if (id) revalidatePath(`/dashboard/contacts/${id}`);
};

export const createContactAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const form = parseContactForm(formData);
  if (!form.ok) return { error: form.error };

  let id: number;
  try {
    id = (await createContact({ teamId: ctx.teamId, userId: ctx.user.id }, form.data)).id;
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect(`/dashboard/contacts/${id}`);
});

export const updateContactAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Contact not found' };
  const form = parseContactForm(formData);
  if (!form.ok) return { error: form.error };

  try {
    await updateContact({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Contact saved' };
});

export const archiveContactAction = validatedActionWithTenant(anyForm, 'contact:archive', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Contact not found' };
  try {
    await archiveContact({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Contact archived' };
});

export const restoreContactAction = validatedActionWithTenant(anyForm, 'contact:archive', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Contact not found' };
  try {
    await restoreContact({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Contact restored' };
});

// Warna dikirim sebagai string heksadesimal; kosong berarti tanpa warna.
const tagFields = (formData: FormData) => {
  const color = formData.get('color');
  return tagInputSchema.safeParse({
    name: formData.get('name') ?? '',
    color: typeof color === 'string' && color ? color : null,
  });
};

export const createTagAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const parsed = tagFields(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await createTag({ teamId: ctx.teamId, userId: ctx.user.id }, parsed.data);
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { success: 'Tag added' };
});

export const updateTagAction = validatedActionWithTenant(anyForm, 'contact:tag-manage', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Tag not found' };
  const parsed = tagFields(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  try {
    await updateTag({ teamId: ctx.teamId, userId: ctx.user.id }, id, parsed.data);
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { success: 'Tag saved' };
});

export const deleteTagAction = validatedActionWithTenant(anyForm, 'contact:tag-manage', async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Tag not found' };
  try {
    await deleteTag({ teamId: ctx.teamId, userId: ctx.user.id }, id);
  } catch (e) {
    return failure(e);
  }
  refresh();
  return { success: 'Tag deleted' };
});
