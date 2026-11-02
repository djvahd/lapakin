// Membuat PDF "dokumen pendukung" untuk onboarding Midtrans dari situs yang sedang berjalan.
//
//   node scripts/midtrans-doc.mjs https://lapakin.adrielharjanto.workers.dev
//   node scripts/midtrans-doc.mjs http://localhost:3102        (pratinjau lokal; URL di dokumen tetap URL publik)
//
// Opsional: PUBLIC_URL=https://... menentukan URL yang dicetak di dokumen bila berbeda dari yang dipotret.
// Identitas usaha dibaca dari halaman /contact situs itu sendiri, harga dari lib/payments/plans.ts, dan
// tangkapan layar diambil langsung dari halaman publik, jadi dokumen selalu cocok dengan situs yang ditinjau.
// Keluaran: docs/generated/dokumen-pendukung-midtrans.pdf (tidak di-commit).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Pemakaian: node scripts/midtrans-doc.mjs <URL situs>');
  process.exit(1);
}
const publicUrl = (process.env.PUBLIC_URL ?? base).replace(/\/$/, '');
const outDir = 'docs/generated';
mkdirSync(outDir, { recursive: true });

const plans = readFileSync('lib/payments/plans.ts', 'utf8');
const month = Number(/month:\s*([\d_]+)/.exec(plans)?.[1].replaceAll('_', ''));
const year = Number(/year:\s*([\d_]+)/.exec(plans)?.[1].replaceAll('_', ''));
if (!month || !year) throw new Error('Harga tidak terbaca dari lib/payments/plans.ts');
const idr = (n) => `Rp${n.toLocaleString('id-ID')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
// Lencana dev server Next.js tidak boleh ikut terpotret bila yang dipotret server lokal.
await page.addInitScript(() => {
  const style = document.createElement('style');
  style.textContent = 'nextjs-portal { display: none !important; }';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
});
const png = async (buf) => `data:image/png;base64,${buf.toString('base64')}`;

// Identitas dari halaman kontak.
await page.goto(`${base}/contact`, { waitUntil: 'networkidle' });
const identity = await page.$$eval('dl > div', (rows) =>
  Object.fromEntries(rows.map((r) => [r.querySelector('dt')?.textContent?.trim() ?? '', r.querySelector('dd')?.textContent?.trim() ?? '']))
);
const missing = ['Penyelenggara', 'Email', 'Alamat'].filter((k) => !identity[k]);
if (missing.length) throw new Error(`Halaman /contact belum menampilkan: ${missing.join(', ')}. Deploy versi terbaru dulu.`);

// Tangkapan layar halaman publik.
const shots = {};
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
const h1 = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ');
if (/Build Your SaaS|Deploy your own|Stripe/i.test(await page.locator('main').innerText())) {
  throw new Error('Situs masih menampilkan template starter. Deploy versi terbaru dulu.');
}
shots.hero = await png(await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 520 } }));
shots.features = await png(await page.locator('section[aria-labelledby="fitur"]').screenshot());
shots.harga = await png(await page.locator('section[aria-labelledby="harga"]').screenshot());
shots.footer = await png(await page.locator('footer').screenshot());

await page.goto(`${base}/pricing`, { waitUntil: 'networkidle' });
shots.pricing = await png(await page.screenshot({ fullPage: true }));

const legal = [
  ['/terms', 'Syarat dan Ketentuan'],
  ['/privacy', 'Kebijakan Privasi'],
  ['/refunds', 'Kebijakan Pengembalian Dana'],
  ['/contact', 'Kontak'],
];
const legalShots = [];
for (const [path, title] of legal) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  legalShots.push({ path, title, img: await png(await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 640 } })) });
}
await browser.close();

const today = new Date().toLocaleDateString('id-ID', { dateStyle: 'long', timeZone: 'Asia/Jakarta' });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Dokumen Pendukung Onboarding Midtrans - Lapakin</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.5 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 4px; color: #111827; }
  h2 { font-size: 13pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #f97316; color: #111827; }
  h3 { font-size: 11pt; margin: 14px 0 6px; }
  p { margin: 6px 0; }
  .sub { color: #6b7280; margin-bottom: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 10.5pt; }
  th, td { border: 1px solid #d1d5db; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #fff7ed; width: 30%; }
  table.grid th { width: auto; }
  img { width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; display: block; }
  figure { margin: 10px 0; break-inside: avoid; }
  figcaption { font-size: 9pt; color: #6b7280; margin-top: 3px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .two figure { margin: 0; }
  ul { margin: 6px 0; padding-left: 20px; }
  .brk { break-before: page; }
  a { color: #c2410c; }
</style></head><body>

<h1>Dokumen Pendukung Onboarding Midtrans</h1>
<p class="sub">Lapakin: ERP dan CRM ringan untuk usaha kecil dan menengah. Disusun pada ${esc(today)}.</p>

<h2>1. Identitas usaha dan website</h2>
<table>
  <tr><th>Nama layanan</th><td>Lapakin</td></tr>
  <tr><th>Penyelenggara</th><td>${esc(identity['Penyelenggara'])}</td></tr>
  <tr><th>Alamat</th><td>${esc(identity['Alamat'])}</td></tr>
  <tr><th>Email</th><td>${esc(identity['Email'])}</td></tr>
  ${identity['Telepon / WhatsApp'] ? `<tr><th>Telepon / WhatsApp</th><td>${esc(identity['Telepon / WhatsApp'])}</td></tr>` : ''}
  <tr><th>Website</th><td><a href="${esc(publicUrl)}">${esc(publicUrl)}</a></td></tr>
  <tr><th>Jenis usaha</th><td>Layanan perangkat lunak berlangganan (SaaS) untuk manajemen kontak, penjualan, stok, dan faktur</td></tr>
</table>

<h2>2. Gambaran layanan</h2>
<p>Lapakin adalah aplikasi web yang membantu usaha kecil dan menengah di bidang jasa dan perdagangan mengelola operasionalnya dalam satu tempat: kontak pelanggan dan pemasok, peluang penjualan (CRM), stok produk, penawaran dan pesanan, pengiriman, faktur, pencatatan pembayaran, serta pengingat otomatis. Layanan diakses lewat peramban; tidak ada barang fisik yang dikirim.</p>
<p>Halaman utama situs memuat judul: <em>${esc(h1)}</em>.</p>

<h2>3. Layanan yang dijual dan harga</h2>
<table class="grid">
  <tr><th>Paket</th><th>Harga (Rupiah)</th><th>Isi</th></tr>
  <tr><td>Free</td><td>${idr(0)}</td><td>Semua modul dengan data sendiri, satu pengguna (pemilik toko), tanpa kartu kredit.</td></tr>
  <tr><td>Pro, bulanan</td><td>${idr(month)} per bulan</td><td>Semua yang ada di Free, anggota tim tanpa batas, otomasi dan notifikasi pengingat.</td></tr>
  <tr><td>Pro, tahunan</td><td>${idr(year)} per tahun (hemat 2 bulan)</td><td>Sama dengan Pro bulanan untuk 12 bulan.</td></tr>
</table>
<p>Harga dalam Rupiah dan tercantum di halaman <a href="${esc(publicUrl)}/pricing">${esc(publicUrl)}/pricing</a> dan di bagian Harga pada halaman utama.</p>

<h2>4. Cara pembayaran dan penyerahan layanan</h2>
<ul>
  <li>Pembayaran langganan diproses sepenuhnya oleh Midtrans (Snap): QRIS, transfer bank virtual account, e-wallet, atau kartu. Lapakin tidak menyimpan data kartu atau rekening.</li>
  <li>Langganan dibayar per periode (bulanan atau tahunan) dan <strong>tidak diperpanjang otomatis</strong>; pelanggan memperpanjang sendiri.</li>
  <li>Layanan bersifat digital: paket Pro aktif segera setelah Midtrans mengonfirmasi pembayaran (notifikasi berverifikasi tanda tangan).</li>
  <li>Kebijakan pengembalian dana: <a href="${esc(publicUrl)}/refunds">${esc(publicUrl)}/refunds</a>.</li>
</ul>

<h2>5. Halaman yang dapat diakses publik tanpa login</h2>
<table class="grid">
  <tr><th>Halaman</th><th>Isi</th></tr>
  <tr><td><a href="${esc(publicUrl)}/">${esc(publicUrl)}/</a></td><td>Landing page: deskripsi layanan, modul, harga, FAQ</td></tr>
  <tr><td><a href="${esc(publicUrl)}/pricing">/pricing</a></td><td>Daftar paket dan harga</td></tr>
  <tr><td><a href="${esc(publicUrl)}/terms">/terms</a></td><td>Syarat dan Ketentuan</td></tr>
  <tr><td><a href="${esc(publicUrl)}/privacy">/privacy</a></td><td>Kebijakan Privasi</td></tr>
  <tr><td><a href="${esc(publicUrl)}/refunds">/refunds</a></td><td>Kebijakan Pengembalian Dana</td></tr>
  <tr><td><a href="${esc(publicUrl)}/contact">/contact</a></td><td>Identitas dan kontak penyelenggara</td></tr>
</table>

<h2 class="brk">6. Tangkapan layar landing page</h2>
<figure><img src="${shots.hero}"><figcaption>Bagian atas halaman utama (${esc(publicUrl)}/)</figcaption></figure>
<figure><img src="${shots.features}"><figcaption>Alur dan modul layanan</figcaption></figure>

<h2 class="brk">7. Tangkapan layar harga</h2>
<figure><img src="${shots.harga}"><figcaption>Bagian Harga pada halaman utama</figcaption></figure>
<figure><img src="${shots.pricing}"><figcaption>Halaman ${esc(publicUrl)}/pricing</figcaption></figure>

<h2 class="brk">8. Halaman kebijakan dan kontak</h2>
<div class="two">
${legalShots.map((s) => `<figure><img src="${s.img}"><figcaption>${esc(s.title)} (${esc(s.path)})</figcaption></figure>`).join('\n')}
</div>
<figure><img src="${shots.footer}"><figcaption>Footer pada setiap halaman publik: identitas, kontak, dan tautan kebijakan</figcaption></figure>

</body></html>`;

const htmlPath = `${outDir}/dokumen-pendukung-midtrans.html`;
writeFileSync(htmlPath, html);

const b2 = await chromium.launch({ channel: process.env.E2E_CHANNEL || undefined });
const p2 = await b2.newPage();
await p2.goto(`file://${process.cwd().replaceAll('\\', '/')}/${htmlPath}`);
await p2.pdf({ path: `${outDir}/dokumen-pendukung-midtrans.pdf`, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' } });
await b2.close();
console.log(`Selesai: ${outDir}/dokumen-pendukung-midtrans.pdf`);
