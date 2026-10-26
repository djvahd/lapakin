import type { ActivityLabels } from '@/lib/activity-labels';

const title = (m: Record<string, unknown> | null) => (typeof m?.title === 'string' ? ` "${m.title}"` : '');
const str = (m: Record<string, unknown> | null, k: string) => (typeof m?.[k] === 'string' ? (m[k] as string) : null);

// Teks audit log untuk aksi modul CRM (dari sudut pandang pelaku: "You ...").
export const crmAuditLabels: ActivityLabels = {
  CRM_OPPORTUNITY_CREATED: (m) => `You added opportunity${title(m)}`,
  CRM_OPPORTUNITY_UPDATED: (m) => `You updated opportunity${title(m)}`,
  CRM_OPPORTUNITY_MOVED: (m) => {
    const to = str(m, 'toStage');
    return `You moved opportunity${title(m)}${to ? ` to ${to}` : ''}`;
  },
  CRM_OPPORTUNITY_ARCHIVED: (m) => `You archived opportunity${title(m)}`,
  CRM_OPPORTUNITY_RESTORED: (m) => `You restored opportunity${title(m)}`,
  CRM_ACTIVITY_CREATED: (m) => `You scheduled a follow-up${str(m, 'summary') ? ` "${str(m, 'summary')}"` : ''}`,
  CRM_ACTIVITY_DONE: (m) => `You completed a follow-up${str(m, 'summary') ? ` "${str(m, 'summary')}"` : ''}`,
  CRM_ACTIVITY_REOPENED: (m) => `You reopened a follow-up${str(m, 'summary') ? ` "${str(m, 'summary')}"` : ''}`,
};
