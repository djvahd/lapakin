// Peristiwa domain yang bisa memicu aturan. Modul pemilik memanggil emit() dengan payload yang
// bidangnya terdaftar di sini; bidang itu juga yang boleh dipakai di kondisi dan templat aksi.
export const EVENTS = {
  'invoice.overdue': {
    label: 'Invoice is overdue',
    fields: ['invoiceId', 'number', 'contact', 'balance', 'dueDate', 'daysOverdue'],
  },
  'crm.followup_overdue': {
    label: 'CRM follow-up is overdue',
    fields: ['activityId', 'summary', 'opportunityId', 'opportunity', 'dueDate', 'daysOverdue'],
  },
} as const;

export type EventName = keyof typeof EVENTS;
export const EVENT_NAMES = Object.keys(EVENTS) as [EventName, ...EventName[]];

// Dua kunci khusus di luar daftar bidang: `dedupeKey` (aturan yang sama tidak berjalan dua kali untuk
// kunci yang sama) dan `userId` (penerima untuk aksi dengan recipient "payload_user").
export type EventPayload = Record<string, unknown> & { dedupeKey?: string; userId?: number };

// Bentuk datar untuk form (komponen klien tidak mengimpor registry langsung).
export const eventOptions = () =>
  Object.entries(EVENTS).map(([name, e]) => ({ name, label: e.label, fields: [...e.fields] }));
