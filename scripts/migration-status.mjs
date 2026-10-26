// Menampilkan migrasi mana yang sudah dan belum diterapkan pada sebuah database. Hanya membaca.
//
//   node scripts/migration-status.mjs                                   -> database dari .env (MIGRATION_URL atau POSTGRES_URL)
//   MIGRATION_URL=<url pemilik production> node scripts/migration-status.mjs   -> database lain, mis. production
//
// Berguna sebelum dan sesudah `pnpm db:migrate`: kode baru hanya boleh di-deploy bila tidak ada yang PENDING.
import { existsSync, readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
const url = process.env.MIGRATION_URL ?? get('MIGRATION_URL') ?? get('POSTGRES_URL');
if (!url) throw new Error('MIGRATION_URL / POSTGRES_URL tidak ada di environment maupun .env');

const target = new URL(url);
console.log(`Database: ${target.host}${target.pathname} (role ${target.username})`);

const journal = JSON.parse(readFileSync('lib/db/migrations/meta/_journal.json', 'utf8')).entries;

// drizzle mencatat created_at = nilai "when" dari jurnal. Tabel belum ada berarti belum pernah dimigrasi.
let applied = new Set();
try {
  const rows = await neon(url)`select created_at from drizzle.__drizzle_migrations`;
  applied = new Set(rows.map((r) => Number(r.created_at)));
} catch (e) {
  if (!/does not exist/i.test(String(e?.message ?? e))) throw e;
}

let pending = 0;
for (const entry of journal) {
  const done = applied.has(entry.when);
  if (!done) pending += 1;
  console.log(`${done ? 'applied ' : 'PENDING '} ${entry.tag}`);
}
console.log(pending === 0 ? 'Semua migrasi sudah diterapkan.' : `${pending} migrasi belum diterapkan: jalankan pnpm db:migrate dengan URL pemilik.`);
