import { contactAuditLabels } from '@/modules/contacts/audit-labels';
import { crmAuditLabels } from '@/modules/crm/audit-labels';
import { inventoryAuditLabels } from '@/modules/inventory/audit-labels';
import { salesAuditLabels } from '@/modules/sales/audit-labels';
import { billingAuditLabels } from '@/modules/billing/audit-labels';
import { automationAuditLabels } from '@/modules/automation/audit-labels';
import { subscriptionAuditLabels } from '@/lib/payments/audit-labels';

export type ActivityMeta = Record<string, unknown> | null;
export type ActivityLabels = Record<string, (meta: ActivityMeta) => string>;

// Label audit log dari semua modul. Modul baru mendaftarkan labelnya di sini.
const registry: ActivityLabels = {
  ...contactAuditLabels,
  ...crmAuditLabels,
  ...inventoryAuditLabels,
  ...salesAuditLabels,
  ...billingAuditLabels,
  ...automationAuditLabels,
  ...subscriptionAuditLabels,
};

// Teks untuk aksi modul, atau null bila aksi itu bukan milik modul mana pun
// (aksi bawaan seperti SIGN_IN ditangani di halaman Activity).
export function moduleActivityText(action: string, meta: unknown): string | null {
  const label = registry[action];
  if (!label) return null;
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  return label(m);
}
