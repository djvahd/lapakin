'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { parseAdjustForm, parseProductForm, parseStockForm, parseVariantForm } from './form';
import {
  InventoryError,
  addVariant,
  adjustStock,
  archiveProduct,
  archiveVariant,
  createProduct,
  issueStock,
  receiveStock,
  restoreProduct,
  restoreVariant,
  updateProduct,
  updateVariant,
} from './service';

// Seperti modul Kontak: form dibaca dari FormData sendiri (checkbox dan angka kosong).
const anyForm = z.object({}).passthrough();

const failure = (e: unknown) => {
  if (e instanceof InventoryError) return { error: e.message };
  throw e;
};

const idOf = (formData: FormData, key = 'id') => {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refresh = (productId?: number) => {
  revalidatePath('/dashboard/inventory');
  if (productId) revalidatePath(`/dashboard/inventory/${productId}`);
};

export const createProductAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const form = parseProductForm(formData);
  if (!form.ok) return { error: form.error };
  let id: number;
  try {
    id = (await createProduct({ teamId: ctx.teamId, userId: ctx.user.id }, form.data)).id;
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect(`/dashboard/inventory/${id}`);
});

export const updateProductAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Product not found' };
  const form = parseProductForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await updateProduct({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Product saved' };
});

const productArchive = (fn: typeof archiveProduct, done: string) =>
  validatedActionWithTenant(anyForm, 'inventory:archive', async (_d, formData, ctx) => {
    const id = idOf(formData);
    if (!id) return { error: 'Product not found' };
    try {
      await fn({ teamId: ctx.teamId, userId: ctx.user.id }, id);
    } catch (e) {
      return failure(e);
    }
    refresh(id);
    return { success: done };
  });

export const archiveProductAction = productArchive(archiveProduct, 'Product archived');
export const restoreProductAction = productArchive(restoreProduct, 'Product restored');

export const addVariantAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const productId = idOf(formData, 'productId');
  if (!productId) return { error: 'Product not found' };
  const form = parseVariantForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await addVariant({ teamId: ctx.teamId, userId: ctx.user.id }, productId, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(productId);
  return { success: 'Variant added' };
});

export const updateVariantAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  const productId = idOf(formData, 'productId');
  if (!id || !productId) return { error: 'Variant not found' };
  const form = parseVariantForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await updateVariant({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(productId);
  return { success: 'Variant saved' };
});

const variantArchive = (fn: typeof archiveVariant, done: string) =>
  validatedActionWithTenant(anyForm, 'inventory:archive', async (_d, formData, ctx) => {
    const id = idOf(formData);
    const productId = idOf(formData, 'productId');
    if (!id || !productId) return { error: 'Variant not found' };
    try {
      await fn({ teamId: ctx.teamId, userId: ctx.user.id }, id);
    } catch (e) {
      return failure(e);
    }
    refresh(productId);
    return { success: done };
  });

export const archiveVariantAction = variantArchive(archiveVariant, 'Variant archived');
export const restoreVariantAction = variantArchive(restoreVariant, 'Variant restored');

const stockAction = (kind: 'receive' | 'issue') =>
  validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
    const productId = idOf(formData, 'productId');
    if (!productId) return { error: 'Product not found' };
    const form = parseStockForm(formData);
    if (!form.ok) return { error: form.error };
    try {
      const actor = { teamId: ctx.teamId, userId: ctx.user.id };
      await (kind === 'receive' ? receiveStock : issueStock)(actor, form.data);
    } catch (e) {
      return failure(e);
    }
    refresh(productId);
    return { success: kind === 'receive' ? 'Stock received' : 'Stock issued' };
  });

export const receiveStockAction = stockAction('receive');
export const issueStockAction = stockAction('issue');

export const adjustStockAction = validatedActionWithTenant(anyForm, 'inventory:adjust', async (_d, formData, ctx) => {
  const productId = idOf(formData, 'productId');
  if (!productId) return { error: 'Product not found' };
  const form = parseAdjustForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    const { delta } = await adjustStock({ teamId: ctx.teamId, userId: ctx.user.id }, form.data);
    refresh(productId);
    return { success: delta === 0 ? 'Count matches stock, nothing changed' : 'Stock adjusted' };
  } catch (e) {
    return failure(e);
  }
});
