import { expect, test } from '@playwright/test';

// Halaman publik yang ditinjau Midtrans: landing dengan harga, halaman hukum, dan kontak. Tanpa login.
test('landing dan halaman hukum bisa diakses tanpa login', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ERP dan CRM ringan');
  await expect(page.getByText('Rp99.000').first()).toBeVisible();
  await expect(page.getByText('Rp990.000').first()).toBeVisible();
  // Tidak ada sisa template starter.
  await expect(page.getByText(/Deploy your own|Build Your SaaS|ACME/)).toHaveCount(0);

  for (const [name, heading] of [
    ['Syarat dan Ketentuan', 'Syarat dan Ketentuan'],
    ['Kebijakan Privasi', 'Kebijakan Privasi'],
    ['Pengembalian Dana', 'Kebijakan Pengembalian Dana'],
    ['Kontak', 'Kontak'],
  ] as const) {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText('Terakhir diperbarui:')).toBeVisible();
  }

  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: 'Pro' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Daftar untuk berlangganan' })).toBeVisible();
});
