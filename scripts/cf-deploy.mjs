// Build dan deploy ke Cloudflare Workers tanpa membawa rahasia lokal.
// OpenNext membundel isi .env* ke Worker saat build, jadi file itu disembunyikan
// selama build lalu dikembalikan. Rahasia produksi diisi lewat `wrangler secret put`.
import { existsSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const cli = 'node_modules/@opennextjs/cloudflare/dist/cli/index.js';
const envFiles = ['.env', '.env.local', '.env.production', '.env.production.local'].filter(existsSync);
const buildOnly = process.argv.includes('--build-only');

const run = (args, env = {}) => {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`Gagal: node ${args.join(' ')}`);
};

try {
  for (const f of envFiles) renameSync(f, `${f}.deploy-bak`);
  // Nilai dummy hanya agar modul bisa di-import saat build; tidak masuk ke runtime.
  run([cli, 'build'], {
    POSTGRES_URL: 'postgresql://build:build@localhost/build',
    AUTH_SECRET: 'build-only',
    STRIPE_SECRET_KEY: 'sk_test_build_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_build_only',
    BASE_URL: 'http://localhost'
  });
} finally {
  for (const f of envFiles) if (existsSync(`${f}.deploy-bak`)) renameSync(`${f}.deploy-bak`, f);
}

if (!buildOnly) run([cli, 'deploy']);
