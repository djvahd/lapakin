'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { parseDeliveryForm, parseOrderForm } from './form';
import {
  SalesError,
  cancelOrder,
  confirmOrder,
  createDelivery,
  createOrder,
  markSent,
  rejectOrder,
  updateOrder,
} from './service';

// Seperti modul Inventory: form dibaca dari FormData sendiri (kolom berulang dan angka kosong).
const anyForm = z.object({}).passthrough();

const failure = (e: unknown) => {
  if (e instanceof SalesError) return { error: e.message };
  throw e;
};

const idOf = (formData: FormData, key = 'id') => {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refresh = (id?: number) => {
  revalidatePath('/dashboard/sales');
  if (id) revalidatePath(`/dashboard/sales/${id}`);
};

export const createOrderAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const form = parseOrderForm(formData);
  if (!form.ok) return { error: form.error };
  let id: number;
  try {
    id = (await createOrder({ teamId: ctx.teamId, userId: ctx.user.id }, form.data)).id;
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect(`/dashboard/sales/${id}`);
});

export const updateOrderAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Order not found' };
  const form = parseOrderForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await updateOrder({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Quotation saved' };
});

const transitionAction = (fn: typeof markSent, done: string, permission: 'sales:cancel' | null = null) =>
  validatedActionWithTenant(anyForm, permission, async (_d, formData, ctx) => {
    const id = idOf(formData);
    if (!id) return { error: 'Order not found' };
    try {
      await fn({ teamId: ctx.teamId, userId: ctx.user.id }, id);
    } catch (e) {
      return failure(e);
    }
    refresh(id);
    return { success: done };
  });

export const markSentAction = transitionAction(markSent, 'Marked as sent');
export const rejectOrderAction = transitionAction(rejectOrder, 'Marked as rejected');
export const confirmOrderAction = transitionAction(confirmOrder, 'Order confirmed');
export const cancelOrderAction = transitionAction(cancelOrder, 'Order cancelled', 'sales:cancel');

export const createDeliveryAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const orderId = idOf(formData, 'orderId');
  if (!orderId) return { error: 'Order not found' };
  const form = parseDeliveryForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await createDelivery({ teamId: ctx.teamId, userId: ctx.user.id }, orderId, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(orderId);
  revalidatePath('/dashboard/inventory');
  return { success: 'Delivery recorded' };
});
