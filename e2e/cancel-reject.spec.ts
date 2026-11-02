import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

// Jalur "tidak jadi": penawaran ditolak, pesanan dibatalkan (sebelum ada pengiriman), faktur dibatalkan.
// Memakai baris bebas (tanpa stok) agar tidak bergantung pada data produk.
async function newQuotation(page: Page, description: string) {
  await page.goto('/dashboard/sales/new');
  await page.getByLabel('Customer').selectOption({ label: 'Budi E2E' });
  await page.getByLabel('Description').fill(description);
  await page.getByLabel('Unit price').fill('50000');
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await page.waitForURL(/\/dashboard\/sales\/\d+$/);
}

test('menolak penawaran, membatalkan pesanan, dan membatalkan faktur', async ({ page }) => {
  await signIn(page);

  // Penawaran ditolak: status Rejected dan tidak ada lagi tombol konfirmasi.
  await newQuotation(page, 'Penawaran yang ditolak');
  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm order' })).toHaveCount(0);

  // Pesanan dibatalkan sebelum pengiriman.
  await newQuotation(page, 'Pesanan yang dibatalkan');
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText('Cancelled', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record delivery' })).toHaveCount(0);

  // Faktur (draf) dibatalkan: statusnya Void dan tidak bisa diterbitkan lagi.
  await newQuotation(page, 'Pesanan untuk faktur batal');
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByRole('link', { name: '+ New invoice' })).toBeVisible();
  await page.getByRole('link', { name: '+ New invoice' }).click();
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.waitForURL(/\/dashboard\/invoices\/\d+$/);
  await page.getByRole('button', { name: 'Void invoice' }).click();
  await expect(page.getByText('Void', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Issue invoice' })).toHaveCount(0);
});
