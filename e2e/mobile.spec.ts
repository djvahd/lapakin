import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

// Tampilan ponsel (375 x 812): tidak boleh ada gulir horizontal pada halaman utama, dan menu samping
// harus bisa dibuka lewat tombol.
test.use({ viewport: { width: 375, height: 812 } });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('halaman publik muat di layar ponsel', async ({ page }) => {
  for (const path of ['/', '/pricing', '/terms', '/contact']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    expect(await overflow(page), `gulir horizontal di ${path}`).toBeLessThanOrEqual(1);
  }
});

test('dashboard muat di layar ponsel dan menu bisa dibuka', async ({ page }) => {
  await signIn(page);

  for (const path of ['/dashboard/sales', '/dashboard/sales/new', '/dashboard/invoices', '/dashboard/inventory', '/dashboard/crm']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    expect(await overflow(page), `gulir horizontal di ${path}`).toBeLessThanOrEqual(1);
  }

  // Menu samping tersembunyi sampai tombol menu ditekan.
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Sales' })).toBeHidden();
  await page.getByRole('button', { name: 'Toggle sidebar' }).click();
  await expect(page.getByRole('link', { name: 'Sales' })).toBeVisible();
});
