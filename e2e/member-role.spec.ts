import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Anggota biasa (member) boleh bekerja (membuat penawaran, dll.) tetapi tidak mengelola toko:
// tidak bisa mengganti nama toko, mengundang anggota, membatalkan pesanan atau faktur, atau mengelola otomasi.
test('anggota biasa tidak melihat atau bisa memakai aksi khusus pemilik', async ({ page }) => {
  await signIn(page, 'member');

  // Pengaturan toko: hanya pemilik.
  await page.goto('/dashboard');
  await expect(page.getByText('Only the team owner can rename the store.')).toBeVisible();
  await expect(page.getByLabel('Name').first()).toBeDisabled();
  await expect(page.getByPlaceholder('Enter email')).toBeDisabled();

  // Otomasi: member melihat daftar tetapi tidak ada tombol mengelola.
  await page.goto('/dashboard/automation');
  await expect(page.getByRole('heading', { name: 'Automation' })).toBeVisible();
  await expect(page.getByRole('link', { name: /New rule|Upgrade to Pro/ })).toHaveCount(0);

  // Member tetap boleh bekerja: membuat penawaran.
  await page.goto('/dashboard/sales/new');
  await page.getByLabel('Customer').selectOption({ label: 'Budi E2E' });
  await page.getByLabel('Description').fill('Jasa konsultasi');
  await page.getByLabel('Unit price').fill('100000');
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await page.waitForURL(/\/dashboard\/sales\/\d+$/);

  // Pesanan terkonfirmasi: member tidak melihat tombol batalkan (hanya pemilik).
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByRole('button', { name: 'Record delivery' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

  // Faktur: member boleh membuat, tetapi tidak membatalkan.
  await page.getByRole('link', { name: '+ New invoice' }).click();
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.waitForURL(/\/dashboard\/invoices\/\d+$/);
  await expect(page.getByRole('button', { name: 'Void invoice' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Issue invoice' })).toBeVisible();

  // Pembayaran langganan: hanya pemilik.
  await page.goto('/pricing');
  await expect(page.getByText('Hanya pemilik toko yang dapat membayar langganan.')).toBeVisible();
});
