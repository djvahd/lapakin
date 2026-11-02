import { expect, test } from '@playwright/test';
import { loadState, ownerSql } from './fixture';

// Alur utama: penawaran -> konfirmasi -> pengiriman (stok berkurang) -> faktur -> terbit -> pembayaran lunas.
test('dari penawaran sampai faktur lunas, dengan stok berkurang saat pengiriman', async ({ page }) => {
  const s = loadState();
  const sql = ownerSql();
  const stock = async () =>
    Number((await sql`select coalesce(sum(quantity), 0) as q from inv_stock_movements where team_id = ${s.teamId} and variant_id = ${s.variantId}`)[0].q);

  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(s.email);
  await page.getByLabel('Password').fill(s.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');

  // Penawaran baru: pelanggan, satu baris produk, jumlah 3.
  await page.goto('/dashboard/sales/new');
  await page.getByLabel('Customer').selectOption({ label: 'Budi E2E' });
  await page.getByLabel('Product').selectOption({ label: 'Kopi E2E' });
  await page.getByLabel('Qty').fill('3');
  await expect(page.getByText('Total: 150,000')).toBeVisible();
  await page.getByRole('button', { name: 'Create quotation' }).click();
  await page.waitForURL(/\/dashboard\/sales\/\d+$/);

  // Stok awal dibaca, bukan diasumsikan 10: bila percobaan pertama sudah mengirim lalu diulang (retry),
  // data toko uji yang sama masih ada, jadi tes harus benar dari stok berapa pun.
  const before = await stock();
  await page.getByRole('button', { name: 'Confirm order' }).click();
  await expect(page.getByRole('button', { name: 'Record delivery' })).toBeVisible();
  expect(await stock()).toBe(before);

  // Kirim seluruhnya (jumlah bawaan = sisa): stok berkurang 3.
  await page.getByRole('button', { name: 'Record delivery' }).click();
  await expect(page.getByText('Everything has been delivered.')).toBeVisible();
  await expect.poll(stock).toBe(before - 3);

  // Faktur dari pesanan: bawaan menagih seluruh sisa.
  await page.getByRole('link', { name: '+ New invoice' }).click();
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.waitForURL(/\/dashboard\/invoices\/\d+$/);
  await page.getByRole('button', { name: 'Issue invoice' }).click();
  await expect(page.getByRole('button', { name: 'Record payment' })).toBeVisible();

  // Bayar penuh (jumlah bawaan = sisa tagihan).
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('This invoice is fully paid.')).toBeVisible();
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();

  // Piutang kosong untuk faktur ini dan halaman cetak bisa dibuka.
  await page.getByRole('link', { name: 'Print / PDF' }).click();
  await expect(page.getByRole('heading', { name: 'INVOICE' })).toBeVisible();
  await expect(page.getByText('Balance due')).toBeVisible();
});
