import type { ActivityLabels } from '@/lib/activity-labels';

const str = (m: Record<string, unknown> | null, k: string) => (typeof m?.[k] === 'string' ? (m[k] as string) : null);
const num = (m: Record<string, unknown> | null, k: string) => (typeof m?.[k] === 'number' ? (m[k] as number) : null);
const quoted = (v: string | null) => (v ? ` "${v}"` : '');

// Penulisan jumlah tanpa nol di belakang koma: 5, 2.5.
const qty = (n: number | null) => (n === null ? '' : String(Math.abs(n)));

// Teks audit log untuk aksi modul Inventory (dari sudut pandang pelaku: "You ...").
export const inventoryAuditLabels: ActivityLabels = {
  INVENTORY_PRODUCT_CREATED: (m) => `You added product${quoted(str(m, 'name'))}`,
  INVENTORY_PRODUCT_UPDATED: (m) => `You updated product${quoted(str(m, 'name'))}`,
  INVENTORY_PRODUCT_ARCHIVED: (m) => `You archived product${quoted(str(m, 'name'))}`,
  INVENTORY_PRODUCT_RESTORED: (m) => `You restored product${quoted(str(m, 'name'))}`,
  INVENTORY_VARIANT_ADDED: (m) => `You added variant${quoted(str(m, 'variant'))} to${quoted(str(m, 'name'))}`,
  INVENTORY_VARIANT_UPDATED: (m) => `You updated variant${quoted(str(m, 'variant'))} of${quoted(str(m, 'name'))}`,
  INVENTORY_VARIANT_ARCHIVED: (m) => `You archived variant${quoted(str(m, 'variant'))} of${quoted(str(m, 'name'))}`,
  INVENTORY_VARIANT_RESTORED: (m) => `You restored variant${quoted(str(m, 'variant'))} of${quoted(str(m, 'name'))}`,
  INVENTORY_STOCK_RECEIPT: (m) => `You received ${qty(num(m, 'quantity'))} of${quoted(str(m, 'name'))}`,
  INVENTORY_STOCK_ISSUE: (m) => `You issued ${qty(num(m, 'quantity'))} of${quoted(str(m, 'name'))}`,
  INVENTORY_STOCK_ADJUSTMENT: (m) => {
    const q = num(m, 'quantity');
    const direction = q !== null && q < 0 ? 'down' : 'up';
    return `You adjusted${quoted(str(m, 'name'))} ${direction} by ${qty(q)}`;
  },
};
