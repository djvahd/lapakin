# Jalur belajar lapakin

Urut sesuai modul v1. Sumber utama adalah dokumentasi resmi, gratis. Cek ulang tautan dan versi saat mulai belajar.

## 0. Dasar (minggu 1 sampai 3)

| Topik | Sumber |
|---|---|
| TypeScript | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) |
| React dan Next.js (App Router, Server Components, Server Actions) | [Next.js Learn](https://nextjs.org/learn) |
| SQL dan PostgreSQL | [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html) |
| Git dan alur PR di GitHub | [GitHub Skills](https://skills.github.com/) |

## 1. Inti (multi-tenant, auth, billing)

| Topik | Sumber |
|---|---|
| ORM dan migrasi | [Drizzle ORM docs](https://orm.drizzle.team/docs/overview) |
| Row Level Security (isolasi tenant) | [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) |
| Neon (Postgres serverless) | [Neon docs](https://neon.com/docs) |
| Validasi data | [Zod](https://zod.dev) |
| Pembayaran Indonesia | [Midtrans docs](https://docs.midtrans.com), [Xendit docs](https://docs.xendit.co) |
| Hosting di Cloudflare | [Workers docs](https://developers.cloudflare.com/workers/), [OpenNext untuk Cloudflare](https://opennext.js.org/cloudflare) |
| UI | [shadcn/ui](https://ui.shadcn.com) |

## 2. Kontak dan CRM

| Topik | Sumber |
|---|---|
| Konsep CRM dan pipeline sebagai acuan | [Dokumentasi Odoo: CRM](https://www.odoo.com/documentation/latest/applications/sales/crm.html) |
| Form dan tabel di React | dokumentasi shadcn/ui (Form, Data Table) |

## 3. Produk dan Inventory

| Topik | Sumber |
|---|---|
| Transaksi dan penguncian (`SELECT ... FOR UPDATE`) | [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) |
| Konsep stok dan mutasi sebagai acuan | [Dokumentasi Odoo: Inventory](https://www.odoo.com/documentation/latest/applications/inventory_and_mrp/inventory.html) |

## 4. Sales dan Invoicing

| Topik | Sumber |
|---|---|
| Alur penawaran ke pesanan ke faktur sebagai acuan | [Dokumentasi Odoo: Sales](https://www.odoo.com/documentation/latest/applications/sales/sales.html) dan [Invoicing](https://www.odoo.com/documentation/latest/applications/finance/accounting/customer_invoices.html) |
| Webhook yang idempoten | dokumentasi webhook Midtrans/Xendit |
| Job terjadwal | [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) |

## 5. Kualitas

| Topik | Sumber |
|---|---|
| Tes unit | [Vitest](https://vitest.dev) |
| Tes end-to-end | [Playwright](https://playwright.dev) |
| Keamanan web dasar | [OWASP Top 10](https://owasp.org/www-project-top-ten/) |

## 6. Buku (opsional)

- *Designing Data-Intensive Applications* oleh Martin Kleppmann, untuk memahami transaksi dan konsistensi data.

## Catatan

Konsep akuntansi untuk v2 (jurnal dua sisi, bagan akun) dipelajari dari dokumentasi Odoo Accounting dan satu akuntan sebagai penelaah.
