import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Tanpa MIDTRANS_SERVER_KEY (lingkungan uji), checkout harus gagal dengan pesan jelas, bukan error halaman.
// Pembayaran sungguhan diuji lewat tes webhook di Vitest dan sandbox Midtrans secara manual.
test('halaman harga dan kartu langganan', async ({ page }) => {
  await signIn(page);

  await page.goto('/dashboard');
  await expect(page.getByText('Current Plan: Free')).toBeVisible();
  await page.getByRole('link', { name: 'Upgrade' }).click();
  await page.waitForURL('**/pricing');

  await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
  await expect(page.getByText('Rp99.000').first()).toBeVisible();
  await expect(page.getByText('Rp990.000').first()).toBeVisible();

  await page.getByRole('button', { name: /Bayar bulanan/ }).click();
  await expect(page.getByText('Midtrans is not configured')).toBeVisible();
});
