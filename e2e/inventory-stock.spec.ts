import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Produk baru -> terima stok -> keluarkan lebih dari stok ditolak -> keluarkan sebagian -> stok akhir benar.
test('produk, terima, dan keluarkan stok', async ({ page }) => {
  await signIn(page);

  await page.goto('/dashboard/inventory/new');
  await page.getByLabel('Name').fill('Gula Aren E2E');
  await page.getByLabel('Sale price').fill('20000');
  await page.getByRole('button', { name: 'Create product' }).click();
  await page.waitForURL(/\/dashboard\/inventory\/\d+$/);
  await expect(page.getByText('0 pcs in stock')).toBeVisible();

  // Terima 5.
  await page.getByLabel('Quantity received').fill('5');
  await page.getByRole('button', { name: 'Receive stock' }).click();
  await expect(page.getByText('Stock received')).toBeVisible();
  await expect(page.getByText('5 pcs in stock')).toBeVisible();

  // Keluarkan 9 (lebih dari stok): ditolak, stok tetap 5.
  await page.getByRole('tab', { name: 'Issue' }).click();
  await page.getByLabel('Quantity issued').fill('9');
  await page.getByRole('button', { name: 'Issue stock' }).click();
  await expect(page.getByText(/Not enough stock/)).toBeVisible();
  await expect(page.getByText('5 pcs in stock')).toBeVisible();

  // Keluarkan 2: sisa 3.
  await page.getByLabel('Quantity issued').fill('2');
  await page.getByRole('button', { name: 'Issue stock' }).click();
  await expect(page.getByText('Stock issued')).toBeVisible();
  await expect(page.getByText('3 pcs in stock')).toBeVisible();

  // Produk muncul di daftar dengan stoknya.
  await page.goto('/dashboard/inventory');
  await expect(page.getByRole('link', { name: /Gula Aren E2E/ })).toContainText('3 pcs');
});
