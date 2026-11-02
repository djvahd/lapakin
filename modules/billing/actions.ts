'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { parseInvoiceForm, parsePaymentForm } from './form';
import {
  BillingError,
  createInvoice,
  issueInvoice,
  recordPayment,
  updateInvoice,
  voidInvoice,
} from './service';

// Seperti modul Sales: form dibaca dari FormData sendiri (kolom jumlah per baris).
const anyForm = z.object({}).passthrough();

const failure = (e: unknown) => {
  if (e instanceof BillingError) return { error: e.message };
  throw e;
};

const idOf = (formData: FormData, key = 'id') => {
  const n = Number(formData.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

const refresh = (id?: number) => {
  revalidatePath('/dashboard/invoices');
  if (id) revalidatePath(`/dashboard/invoices/${id}`);
};

export const createInvoiceAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const orderId = idOf(formData, 'orderId');
  if (!orderId) return { error: 'Order not found' };
  const form = parseInvoiceForm(formData);
  if (!form.ok) return { error: form.error };
  let id: number;
  try {
    id = (await createInvoice({ teamId: ctx.teamId, userId: ctx.user.id }, orderId, form.data)).id;
  } catch (e) {
    return failure(e);
  }
  refresh();
  redirect(`/dashboard/invoices/${id}`);
});

export const updateInvoiceAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const id = idOf(formData);
  if (!id) return { error: 'Invoice not found' };
  const form = parseInvoiceForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await updateInvoice({ teamId: ctx.teamId, userId: ctx.user.id }, id, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(id);
  return { success: 'Invoice saved' };
});

const transitionAction = (fn: typeof issueInvoice, done: string, permission: 'invoice:void' | null = null) =>
  validatedActionWithTenant(anyForm, permission, async (_d, formData, ctx) => {
    const id = idOf(formData);
    if (!id) return { error: 'Invoice not found' };
    try {
      await fn({ teamId: ctx.teamId, userId: ctx.user.id }, id);
    } catch (e) {
      return failure(e);
    }
    refresh(id);
    return { success: done };
  });

export const issueInvoiceAction = transitionAction(issueInvoice, 'Invoice issued');
export const voidInvoiceAction = transitionAction(voidInvoice, 'Invoice voided', 'invoice:void');

export const recordPaymentAction = validatedActionWithTenant(anyForm, null, async (_d, formData, ctx) => {
  const invoiceId = idOf(formData, 'invoiceId');
  if (!invoiceId) return { error: 'Invoice not found' };
  const form = parsePaymentForm(formData);
  if (!form.ok) return { error: form.error };
  try {
    await recordPayment({ teamId: ctx.teamId, userId: ctx.user.id }, invoiceId, form.data);
  } catch (e) {
    return failure(e);
  }
  refresh(invoiceId);
  return { success: 'Payment recorded' };
});
