import { CONDITION_OPS } from './schema';
import { ruleInputSchema, type RuleInput } from './schemas';

// Penerjemah antara FormData dan skema aturan. Murni (tanpa database), jadi mudah dites.

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
};

const all = (fd: FormData, key: string) => fd.getAll(key).map((v) => (typeof v === 'string' ? v : ''));

// Kondisi dikirim sebagai kolom berulang yang sejajar (condField, condOp, condValue). Baris tanpa
// bidang dilewati. Nilai disimpan sebagai teks; mesin membandingkannya sebagai angka bila keduanya angka.
export function parseRuleForm(fd: FormData): FormResult<RuleInput> {
  const fields = all(fd, 'condField');
  const ops = all(fd, 'condOp');
  const values = all(fd, 'condValue');

  const conditions = fields
    .map((field, i) => ({ field: field.trim(), op: ops[i] || CONDITION_OPS[0], value: (values[i] ?? '').trim() }))
    .filter((c) => c.field);

  const parsed = ruleInputSchema.safeParse({
    name: text(fd, 'name') ?? '',
    event: text(fd, 'event'),
    conditions,
    action: text(fd, 'action') || 'notify',
    actionConfig: {
      title: text(fd, 'title') ?? '',
      body: text(fd, 'body'),
      link: text(fd, 'link'),
      recipient: text(fd, 'recipient') || undefined,
    },
    active: fd.get('active') === 'on',
  });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
}
