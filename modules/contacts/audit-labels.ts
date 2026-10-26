import type { ActivityLabels } from '@/lib/activity-labels';

const named = (m: Record<string, unknown> | null) => (typeof m?.name === 'string' ? ` "${m.name}"` : '');

// Teks audit log untuk aksi modul kontak (ditulis dari sudut pandang pelaku: "You ...").
export const contactAuditLabels: ActivityLabels = {
  CONTACT_CREATED: (m) => `You added contact${named(m)}`,
  CONTACT_UPDATED: (m) => `You updated contact${named(m)}`,
  CONTACT_ARCHIVED: (m) => `You archived contact${named(m)}`,
  CONTACT_RESTORED: (m) => `You restored contact${named(m)}`,
  CONTACT_TAG_CREATED: (m) => `You added the tag${named(m)}`,
};
