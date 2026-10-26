// Menyetel password role lapakin_app dengan nilai acak, lalu menyusun connection string aplikasi.
//
//   node scripts/set-app-role-password.mjs            -> perbarui .env (MIGRATION_URL = pemilik, POSTGRES_URL = lapakin_app)
//   node scripts/set-app-role-password.mjs --print    -> hanya cetak connection string lapakin_app (untuk `wrangler secret put`)
//
// Dijalankan dengan role pemilik: dibaca dari MIGRATION_URL, atau POSTGRES_URL bila .env belum dipisah.
// Password tidak ditulis ke repo; dengan --print ia hanya tampil di terminal Anda.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const envPath = '.env';
const print = process.argv.includes('--print');
const env = readFileSync(envPath, 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const ownerUrl = get('MIGRATION_URL') ?? get('POSTGRES_URL');
if (!ownerUrl) throw new Error('POSTGRES_URL / MIGRATION_URL tidak ada di .env');

const owner = new URL(ownerUrl);
if (owner.username === 'lapakin_app') {
  throw new Error('URL di .env sudah memakai lapakin_app; isi MIGRATION_URL dengan URL pemilik.');
}

const password = randomBytes(24).toString('hex');
await neon(ownerUrl).query(`ALTER ROLE lapakin_app PASSWORD '${password}'`);

const app = new URL(ownerUrl);
app.username = 'lapakin_app';
app.password = password;

if (print) {
  console.log(app.toString());
} else {
  const set = (text, k, v) =>
    new RegExp(`^${k}=`, 'm').test(text) ? text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${text.trimEnd()}\n${k}=${v}\n`;
  let next = set(env, 'MIGRATION_URL', ownerUrl);
  next = set(next, 'POSTGRES_URL', app.toString());
  writeFileSync(`${envPath}.tmp`, next);
  renameSync(`${envPath}.tmp`, envPath);
  console.log('Password lapakin_app disetel. .env: MIGRATION_URL = pemilik, POSTGRES_URL = lapakin_app.');
}
