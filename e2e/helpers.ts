import type { Page } from '@playwright/test';
import { loadState } from './fixture';

export async function signIn(page: Page) {
  const s = loadState();
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(s.email);
  await page.getByLabel('Password').fill(s.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
}
