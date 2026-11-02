import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Kontak baru -> peluang CRM -> penawaran dari peluang (kontak terisi otomatis) -> penawaran tampil di peluang.
test('kontak, peluang, dan penawaran dari peluang', async ({ page }) => {
  await signIn(page);

  await page.goto('/dashboard/contacts/new');
  await page.getByLabel('Name').fill('Sari Pelanggan');
  await page.getByLabel('Email').fill('sari@example.test');
  await page.getByRole('button', { name: 'Create contact' }).click();
  await page.waitForURL(/\/dashboard\/contacts\/\d+$/);
  await expect(page.getByRole('heading', { name: /Sari Pelanggan/ })).toBeVisible();

  // Pencarian di daftar kontak menemukannya.
  await page.goto('/dashboard/contacts');
  await page.getByLabel('Search').fill('Sari Pelanggan');
  await page.getByRole('button', { name: 'Filter' }).click();
  await expect(page.getByRole('link', { name: /Sari Pelanggan/ })).toBeVisible();

  // Peluang untuk kontak itu.
  await page.goto('/dashboard/crm/new');
  await page.getByLabel('Title').fill('Pesanan kopi bulanan');
  await page.getByLabel('Contact').selectOption({ label: 'Sari Pelanggan' });
  await page.getByLabel('Expected value (IDR)').fill('2500000');
  await page.getByRole('button', { name: 'Create opportunity' }).click();
  await page.waitForURL(/\/dashboard\/crm\/\d+$/);
  await expect(page.getByText('No quotations for this opportunity yet.')).toBeVisible();

  // Penawaran dari peluang: pelanggan sudah terpilih; satu baris bebas.
  await page.getByRole('link', { name: '+ New quotation' }).click();
  await page.waitForURL(/\/dashboard\/sales\/new\?opportunity=\d+/);
  await expect(page.getByLabel('Customer')).toHaveValue(/\d+/);
  await page.getByLabel('Description').fill('Langganan kopi');
  await page.getByLabel('Unit price').fill('250000');
  await page.getByLabel('Qty').fill('10');
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await page.waitForURL(/\/dashboard\/sales\/\d+$/);
  await expect(page.getByRole('link', { name: 'View opportunity →' })).toBeVisible();

  // Kembali ke peluang: penawaran terdaftar dengan totalnya.
  await page.getByRole('link', { name: 'View opportunity →' }).click();
  await page.waitForURL(/\/dashboard\/crm\/\d+$/);
  await expect(page.getByRole('link', { name: /^S\d{4}$/ })).toBeVisible();
  await expect(page.getByText('2,500,000').first()).toBeVisible();
});
