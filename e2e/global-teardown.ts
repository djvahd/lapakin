import { TEAM_TABLES, clearState, hasState, loadState, ownerSql } from './fixture';

export default async function globalTeardown() {
  if (!hasState()) return;
  const { teamId, userId, memberId } = loadState();
  const sql = ownerSql();
  for (const t of TEAM_TABLES) await sql.query(`delete from ${t} where team_id = ${teamId}`);
  await sql`delete from teams where id = ${teamId}`;
  await sql`delete from users where id in (${userId}, ${memberId})`;
  clearState();
}
