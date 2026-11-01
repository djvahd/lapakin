import type { ActivityLabels } from '@/lib/activity-labels';

const ref = (m: Record<string, unknown> | null) => {
  const n = m?.number;
  return typeof n === 'number' ? ` ${formatNumber(n)}` : '';
};

export const formatNumber = (n: number) => `S${String(n).padStart(4, '0')}`;

// Teks audit log untuk aksi modul Sales (dari sudut pandang pelaku: "You ...").
export const salesAuditLabels: ActivityLabels = {
  SALES_ORDER_CREATED: (m) => `You created quotation${ref(m)}`,
  SALES_ORDER_UPDATED: (m) => `You updated quotation${ref(m)}`,
  SALES_ORDER_SENT: (m) => `You marked quotation${ref(m)} as sent`,
  SALES_ORDER_REJECTED: (m) => `You marked quotation${ref(m)} as rejected`,
  SALES_ORDER_CONFIRMED: (m) => `You confirmed order${ref(m)}`,
  SALES_ORDER_CANCELLED: (m) => `You cancelled order${ref(m)}`,
  SALES_DELIVERY_CREATED: (m) => `You recorded a delivery for order${ref(m)}`,
};
