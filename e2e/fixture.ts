import { neon } from '@neondatabase/serverless';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Data uji ditulis lewat MIGRATION_URL (pemilik database), seperti tes Vitest, supaya tidak
// bergantung pada UI untuk menyiapkan akun, kontak, dan stok.
export const STATE_FILE = path.join(__dirname, '.state.json');

export type E2eState = { userId: number; teamId: number; email: string; password: string; variantId: number };

export const ownerSql = () => {
  const url = process.env.MIGRATION_URL;
  if (!url) throw new Error('MIGRATION_URL belum diisi di .env');
  return neon(url);
};

export const saveState = (s: E2eState) => writeFileSync(STATE_FILE, JSON.stringify(s));
export const loadState = (): E2eState => JSON.parse(readFileSync(STATE_FILE, 'utf8'));
export const clearState = () => existsSync(STATE_FILE) && unlinkSync(STATE_FILE);
export const hasState = () => existsSync(STATE_FILE);

// Urutan hapus mengikuti kunci asing (anak dulu).
export const TEAM_TABLES = [
  'activity_logs',
  'bill_payments',
  'bill_lines',
  'bill_invoices',
  'sales_delivery_lines',
  'sales_deliveries',
  'sales_lines',
  'sales_orders',
  'crm_activities',
  'crm_opportunities',
  'crm_stages',
  'auto_notifications',
  'auto_runs',
  'auto_rules',
  'inv_stock_movements',
  'inv_variants',
  'inv_products',
  'contacts',
  'team_members',
];
