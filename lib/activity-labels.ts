import { contactAuditLabels } from '@/modules/contacts/audit-labels';
import { crmAuditLabels } from '@/modules/crm/audit-labels';

export type ActivityMeta = Record<string, unknown> | null;
export type ActivityLabels = Record<string, (meta: ActivityMeta) => string>;

// Label audit log dari semua modul. Modul baru mendaftarkan labelnya di sini.
const registry: ActivityLabels = {
  ...contactAuditLabels,
  ...crmAuditLabels,
};

// Teks untuk aksi modul, atau null bila aksi itu bukan milik modul mana pun
// (aksi bawaan seperti SIGN_IN ditangani di halaman Activity).
export function moduleActivityText(action: string, meta: unknown): string | null {
  const label = registry[action];
  if (!label) return null;
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  return label(m);
}
