import type { ActivityLabels } from '@/lib/activity-labels';

const str = (m: Record<string, unknown> | null, k: string) => (typeof m?.[k] === 'string' ? (m[k] as string) : null);
const quoted = (v: string | null) => (v ? ` "${v}"` : '');

// Teks audit log untuk aksi modul Automation (dari sudut pandang pelaku: "You ...").
export const automationAuditLabels: ActivityLabels = {
  AUTOMATION_RULE_CREATED: (m) => `You created automation rule${quoted(str(m, 'name'))}`,
  AUTOMATION_RULE_UPDATED: (m) => `You updated automation rule${quoted(str(m, 'name'))}`,
  AUTOMATION_RULE_ENABLED: (m) => `You enabled automation rule${quoted(str(m, 'name'))}`,
  AUTOMATION_RULE_DISABLED: (m) => `You disabled automation rule${quoted(str(m, 'name'))}`,
  AUTOMATION_RULE_DELETED: (m) => `You deleted automation rule${quoted(str(m, 'name'))}`,
};
