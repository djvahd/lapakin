'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { validatedActionWithTenant } from '@/lib/auth/middleware';
import { PERIODS, PLAN_KEYS, type Period, type PlanKey } from './plans';
import { SubscriptionError, startCheckout } from './subscription';

const anyForm = z.object({}).passthrough();

// Memulai pembayaran langganan: hanya pemilik toko (billing:manage), lalu pindah ke halaman bayar Midtrans.
export const checkoutAction = validatedActionWithTenant(anyForm, 'billing:manage', async (_d, formData, ctx) => {
  const plan = formData.get('plan');
  const period = formData.get('period');
  if (!PLAN_KEYS.includes(plan as PlanKey) || !PERIODS.includes(period as Period)) {
    return { error: 'Choose a plan and billing period' };
  }

  let url: string;
  try {
    url = await startCheckout({ teamId: ctx.teamId, userId: ctx.user.id, email: ctx.user.email }, plan as PlanKey, period as Period);
  } catch (e) {
    if (e instanceof SubscriptionError) return { error: e.message };
    throw e;
  }
  redirect(url);
});
