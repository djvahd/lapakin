import { expect, test } from '@playwright/test';
import { loadState, ownerSql } from './fixture';
import { signIn } from './helpers';

// Aturan dibuat lewat UI; notifikasi disisipkan langsung ke database (mesin dites di Vitest) untuk
// memeriksa lencana, daftar, dan tombol tandai dibaca.
test('aturan otomasi dan notifikasi', async ({ page }) => {
  const s = loadState();
  const sql = ownerSql();
  await signIn(page);

  await page.goto('/dashboard/automation/new');
  await page.getByLabel('Name').fill('Ingatkan tagihan lewat tempo');
  await page.getByRole('button', { name: 'Add condition' }).click();
  await page.getByLabel('Condition 1 field').selectOption('daysOverdue');
  await page.getByLabel('Condition 1 operator').selectOption('gte');
  await page.getByLabel('Condition 1 value').fill('1');
  await page.getByLabel('Title').fill('Faktur {{number}} lewat tempo');
  await page.getByLabel('Link (inside the app)').fill('/dashboard/invoices/{{invoiceId}}');
  await page.getByRole('button', { name: 'Create rule' }).click();
  await page.waitForURL(/\/dashboard\/automation\/\d+$/);
  await expect(page.getByRole('heading', { name: /Ingatkan tagihan lewat tempo/ })).toBeVisible();
  await expect(page.getByText('This rule has not run yet.')).toBeVisible();

  // Tautan luar ditolak.
  await page.getByLabel('Link (inside the app)').fill('https://evil.test');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await expect(page.getByText('Link must start with a single /')).toBeVisible();

  // Matikan aturan.
  await page.getByRole('button', { name: 'Disable' }).click();
  await expect(page.getByRole('button', { name: 'Enable' })).toBeVisible();

  // Notifikasi: lencana di menu, daftar, lalu tandai semua dibaca.
  await sql`insert into auto_notifications (team_id, user_id, title, body, link) values
    (${s.teamId}, ${s.userId}, 'Faktur F0001 lewat tempo', 'Budi berutang 5000', '/dashboard/invoices'),
    (${s.teamId}, ${s.userId}, 'Faktur F0002 lewat tempo', null, null)`;
  await page.goto('/dashboard/notifications');
  await expect(page.getByText('(2 unread)')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Faktur F0001 lewat tempo' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByText('(0 unread)')).toBeVisible();
});
