import type { ActivityLabels } from '@/lib/activity-labels';

const amount = (m: Record<string, unknown> | null) =>
  typeof m?.amount === 'number' ? ` (${m.amount.toLocaleString()})` : '';

// Teks audit log untuk langganan (dari sudut pandang pelaku: "You ...").
export const subscriptionAuditLabels: ActivityLabels = {
  SUBSCRIPTION_CHECKOUT_STARTED: (m) => `You started a subscription payment${amount(m)}`,
  SUBSCRIPTION_PAID: (m) => `Subscription payment received${amount(m)}`,
};
