import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembers, type User } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';
import { getUser } from '@/lib/db/queries';

export type TenantContext = {
  user: User;
  teamId: number;
  role: string;
};

// Keanggotaan pengguna di toko. Dengan sessionTeamId, hanya toko itu yang sah:
// bila pengguna bukan anggotanya (dikeluarkan, atau sesi diubah), hasilnya null dan
// tidak jatuh ke toko lain. Tanpa sessionTeamId (sesi lama) dipakai keanggotaan pertama.
export async function resolveMembership(userId: number, sessionTeamId?: number | null) {
  const [row] = await db
    .select({ teamId: teamMembers.teamId, role: teamMembers.role })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, userId),
        sessionTeamId ? eq(teamMembers.teamId, sessionTeamId) : undefined
      )
    )
    .orderBy(asc(teamMembers.joinedAt), asc(teamMembers.id))
    .limit(1);
  return row ?? null;
}

// Konteks tenant untuk permintaan ini: pengguna, toko aktif, dan role di toko itu.
// Role selalu dari team_members, bukan dari users.role.
export async function getTenantContext(): Promise<TenantContext | null> {
  const user = await getUser();
  if (!user) return null;

  const session = await getSession();
  const membership = await resolveMembership(user.id, session?.teamId);
  if (!membership) return null;

  return { user, teamId: membership.teamId, role: membership.role };
}
