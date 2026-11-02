import type { ActivityLabels } from '@/lib/activity-labels';

export const formatNumber = (n: number) => `F${String(n).padStart(4, '0')}`;

const ref = (m: Record<string, unknown> | null) => {
  const n = m?.number;
  return typeof n === 'number' ? ` ${formatNumber(n)}` : '';
};

// Teks audit log untuk aksi modul Invoicing (dari sudut pandang pelaku: "You ...").
export const billingAuditLabels: ActivityLabels = {
  BILLING_INVOICE_CREATED: (m) => `You created invoice${ref(m)}`,
  BILLING_INVOICE_UPDATED: (m) => `You updated invoice${ref(m)}`,
  BILLING_INVOICE_ISSUED: (m) => `You issued invoice${ref(m)}`,
  BILLING_INVOICE_VOIDED: (m) => `You voided invoice${ref(m)}`,
  BILLING_PAYMENT_RECORDED: (m) => {
    const a = m?.amount;
    return `You recorded a payment${typeof a === 'number' ? ` of ${a.toLocaleString()}` : ''} on invoice${ref(m)}`;
  },
};
