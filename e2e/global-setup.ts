import bcrypt from 'bcryptjs';
import { ownerSql, saveState } from './fixture';

// Toko uji sendiri: pengguna owner, satu kontak, dan satu produk dengan stok 10.
export default async function globalSetup() {
  const sql = ownerSql();
  const tag = `e2e-${Date.now()}`;
  const email = `${tag}@test.local`;
  const password = 'e2e-password-123';
  const hash = await bcrypt.hash(password, 10);

  const userId = (await sql`insert into users (email, password_hash, role) values (${email}, ${hash}, 'owner') returning id`)[0].id as number;
  const teamId = (await sql`insert into teams (name) values (${tag}) returning id`)[0].id as number;
  await sql`insert into team_members (user_id, team_id, role) values (${userId}, ${teamId}, 'owner')`;
  await sql`insert into contacts (team_id, kind, name) values (${teamId}, 'person', 'Budi E2E')`;

  const productId = (await sql`insert into inv_products (team_id, name, sale_price, cost_price) values (${teamId}, 'Kopi E2E', 50000, 30000) returning id`)[0].id as number;
  const variantId = (await sql`insert into inv_variants (team_id, product_id, is_default) values (${teamId}, ${productId}, true) returning id`)[0].id as number;
  await sql`insert into inv_stock_movements (team_id, variant_id, quantity, kind, created_by) values (${teamId}, ${variantId}, 10, 'receipt', ${userId})`;

  saveState({ userId, teamId, email, password, variantId });
}
