import type { Page } from '@playwright/test';
import { loadState } from './fixture';

// Masuk sebagai pemilik toko uji (bawaan) atau sebagai anggota biasa (role member).
export async function signIn(page: Page, who: 'owner' | 'member' = 'owner') {
  const s = loadState();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(who === 'owner' ? s.email : s.memberEmail);
  await page.getByLabel('Password').fill(s.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}
