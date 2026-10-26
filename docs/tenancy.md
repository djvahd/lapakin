# Multi-tenant dan RLS

Tenant = `teams` = toko. Semua data bisnis memakai kolom `team_id`.

## Dua lapis tabel

- **Control plane** (`users`, `teams`, `team_members`, `invitations`): tanpa RLS. Dipakai alur login sebelum tenant diketahui, jadi diakses lewat helper di `lib/db/queries.ts`.
- **Data plane** (`activity_logs` dan semua tabel modul): RLS aktif. Diakses lewat `withTenant`.

## Role database

Role bawaan Neon (`neondb_owner`) memiliki `BYPASSRLS` dan memiliki semua tabel, jadi RLS tidak berlaku baginya. Aplikasi harus tersambung sebagai `lapakin_app`:

| Variabel | Role | Dipakai untuk |
|---|---|---|
| `POSTGRES_URL` | `lapakin_app` | aplikasi, seed, tes |
| `MIGRATION_URL` | pemilik (`neondb_owner`) | `drizzle-kit migrate`, penyiapan data tes |

Penyiapan di sebuah branch Neon:

```bash
pnpm db:migrate                          # membuat role lapakin_app (tanpa password) dan policy
node scripts/set-app-role-password.mjs   # setel password acak, perbarui .env
```

Untuk produksi: jalankan migrasi dengan `MIGRATION_URL` branch production, lalu
`node scripts/set-app-role-password.mjs --print` (dengan `.env` yang menunjuk ke branch production)
dan masukkan hasilnya ke `wrangler secret put POSTGRES_URL`. Password hanya tampil di terminal Anda.

## withTenant

```ts
import { withTenant } from '@/lib/db/tenant';

const [rows] = await withTenant(teamId, [
  db.select().from(contacts).where(eq(contacts.teamId, teamId))
]);
```

Driver HTTP Neon tidak punya sesi, jadi `set_config('app.team_id', ..., true)` dikirim satu `db.batch` (satu transaksi) dengan query-nya. Konteks hilang saat transaksi selesai. Tanpa konteks, policy tidak meloloskan baris apa pun.

Tetap tulis `where team_id = ...` secara eksplisit: itu lapis pertama, RLS lapis kedua.

## Tabel baru untuk modul

```ts
export const contacts = pgTable(
  'contacts',
  { id: serial('id').primaryKey(), teamId: integer('team_id').notNull().references(() => teams.id) /* ... */ },
  () => [tenantIsolation()]
);
```

`tenantIsolation()` ada di `lib/db/schema.ts`. Migrasi `0002_app_role.sql` memberi `lapakin_app` hak DML otomatis untuk tabel baru lewat default privileges.

## Audit log

```ts
import { audit } from '@/lib/audit';
await audit(teamId, userId, 'ORDER_CREATED', { entityType: 'order', entityId: 7, metadata: { total: 1000 } });
```

## Tes

`pnpm test` menjalankan tes integrasi terhadap branch dev Neon (butuh `POSTGRES_URL` sebagai `lapakin_app` dan `MIGRATION_URL` pemilik). Tes sengaja gagal bila aplikasi tersambung sebagai role yang bypass RLS.
