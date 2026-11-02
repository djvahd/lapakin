import type { Condition } from './schema';

// Bagian murni mesin otomasi (tanpa database), supaya mudah dites.

const asNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function check(c: Condition, actual: unknown): boolean {
  if (actual === undefined || actual === null) return false;
  if (c.op === 'eq' || c.op === 'neq') {
    const a = asNumber(actual);
    const b = asNumber(c.value);
    const equal = a !== null && b !== null ? a === b : String(actual) === String(c.value);
    return c.op === 'eq' ? equal : !equal;
  }
  const a = asNumber(actual);
  const b = asNumber(c.value);
  if (a === null || b === null) return false;
  switch (c.op) {
    case 'gt':
      return a > b;
    case 'gte':
      return a >= b;
    case 'lt':
      return a < b;
    default:
      return a <= b;
  }
}

// Semua kondisi harus terpenuhi; bidang yang tidak ada di payload membuat kondisinya gagal.
export const matches = (conditions: Condition[], payload: Record<string, unknown>) =>
  conditions.every((c) => check(c, payload[c.field]));

// Mengganti {{bidang}} dengan nilai payload; bidang yang tidak ada menjadi teks kosong.
export const render = (template: string, payload: Record<string, unknown>) =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const v = payload[key];
    return v === undefined || v === null ? '' : String(v);
  });
