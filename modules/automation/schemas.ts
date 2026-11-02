import { z } from 'zod';
import { EVENTS, EVENT_NAMES } from './events';
import { CONDITION_OPS } from './schema';

export const ACTION_NAMES = ['notify'] as const;

const conditionSchema = z.object({
  field: z.string().trim().min(1).max(50),
  op: z.enum(CONDITION_OPS),
  value: z.union([z.string().max(200), z.number().finite(), z.boolean()]),
});

// Konfigurasi aksi `notify`: templat boleh memakai {{bidang}} dari payload peristiwa.
export const notifyConfigSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
  // Hanya tautan di dalam aplikasi.
  link: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (v.startsWith('/') && !v.startsWith('//')), 'Link must start with a single /'),
  recipient: z.enum(['owners', 'payload_user']).default('owners'),
});

export type NotifyConfig = z.output<typeof notifyConfigSchema>;

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    event: z.enum(EVENT_NAMES),
    conditions: z.array(conditionSchema).max(10, 'Too many conditions').default([]),
    action: z.enum(ACTION_NAMES),
    actionConfig: z.record(z.unknown()).default({}),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const allowed: readonly string[] = EVENTS[v.event].fields;
    v.conditions.forEach((c, i) => {
      if (!allowed.includes(c.field)) {
        ctx.addIssue({ code: 'custom', path: ['conditions', i, 'field'], message: `Unknown field "${c.field}" for this event` });
      }
    });
  })
  .transform((v, ctx) => {
    // Konfigurasi divalidasi menurut aksinya dan disimpan dalam bentuk yang sudah dibersihkan.
    const parsed = notifyConfigSchema.safeParse(v.actionConfig);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ ...issue, path: ['actionConfig', ...issue.path] });
      return z.NEVER;
    }
    return { ...v, actionConfig: parsed.data as Record<string, unknown> };
  });

export type RuleInput = z.output<typeof ruleInputSchema>;
