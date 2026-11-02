import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

// Alur end-to-end berjalan terhadap dev server lokal dan database dev (branch Neon), bukan produksi.
// Data uji dibuat dan dibersihkan oleh e2e/global-setup.ts dan e2e/global-teardown.ts.
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  // Satu toko uji dipakai bersama, jadi tes berjalan berurutan.
  fullyParallel: false,
  workers: 1,
  // Di CI satu ulangan menyerap kegagalan koneksi sesaat ke database; lokal tanpa ulangan agar kegagalan terlihat.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  // Bila beberapa tes gagal berturut-turut penyebabnya hampir pasti sistemik (login rusak, skema tidak cocok):
  // berhenti cepat daripada menunggu semua tes kehabisan waktu (kejadian nyata: 25 menit terbuang).
  maxFailures: process.env.CI ? 3 : 0,
  timeout: 90_000,
  // Aksi server dan revalidasi di runner CI lebih lambat daripada lokal; 5 detik bawaan terlalu ketat.
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // E2E_CHANNEL=msedge (atau chrome) memakai peramban terpasang tanpa mengunduh Chromium bawaan Playwright.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.E2E_CHANNEL || undefined } }],
  webServer: {
    command: `pnpm exec next dev --turbopack -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
