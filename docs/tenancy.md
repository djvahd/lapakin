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

### Produksi

Urutan penting: **kode baru harus ter-deploy sebelum secret diganti ke `lapakin_app`.** Kode lama menulis `activity_logs` tanpa konteks tenant, dan RLS akan menolaknya (login produksi gagal).

Di satu jendela Git Bash (URL tidak masuk riwayat perintah):

```bash
read -rs -p "Owner URL production (direct, tanpa pooling): " PROD_OWNER_URL; echo

# 1. Migrasi ke production sebagai pemilik: membuat role lapakin_app, policy, kolom audit
MIGRATION_URL="$PROD_OWNER_URL" pnpm db:migrate

# 2. Deploy kode baru (secret POSTGRES_URL masih URL pemilik, jadi login tetap jalan)
pnpm run cf:deploy

# 3. Setel password lapakin_app di production dan langsung kirim ke secret Worker.
#    URL tidak ditampilkan; hanya mengalir lewat pipe ke wrangler.
MIGRATION_URL="$PROD_OWNER_URL" node scripts/set-app-role-password.mjs --print | pnpm exec wrangler secret put POSTGRES_URL

unset PROD_OWNER_URL
```

Skrip dengan `MIGRATION_URL` dari variabel lingkungan hanya mau berjalan dengan `--print`, sehingga `.env` dev tidak tertimpa.

Verifikasi: masuk ke situs produksi, buka halaman Activity (harus menampilkan entri dan login baru tercatat). Untuk membuktikan isolasi di produksi tanpa menyentuh datanya, buat branch Neon turunan dari `production`, setel password `lapakin_app` di sana dengan skrip di atas, lalu jalankan `pnpm test` dengan `MIGRATION_URL` dan `POSTGRES_URL` branch itu, dan hapus branchnya.

Rollback: `wrangler secret put POSTGRES_URL` dengan URL pemilik mengembalikan perilaku sebelumnya (RLS tidak berlaku, tapi aplikasi tetap jalan).

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

## Sesi, role, dan izin

- Sesi (JWT) menyimpan `teamId` aktif. Sesi lama tanpa `teamId` memakai keanggotaan paling awal.
- `getTenantContext()` (`lib/auth/tenant.ts`) mengembalikan `{ user, teamId, role }`. Role selalu dari `team_members`, bukan `users.role` (kolom itu tidak dipakai untuk otorisasi). Bila `teamId` di sesi bukan keanggotaan pengguna, hasilnya `null`, tidak jatuh ke toko lain.
- Izin didefinisikan di `lib/auth/permissions.ts`; modul menambahkan izinnya sendiri di sana.

```ts
export const renameStore = validatedActionWithTenant(schema, 'team:update', async (data, _, ctx) => {
  // ctx.teamId, ctx.user, ctx.role
});
```

Pengecekan izin dilakukan di server di `validatedActionWithTenant`. Menonaktifkan tombol di UI hanya untuk tampilan.
