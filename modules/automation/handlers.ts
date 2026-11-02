import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { teamMembers } from '@/lib/db/schema';
import { render } from './engine';
import { autoNotifications } from './schema';
import { notifyConfigSchema } from './schemas';

// Registry aksi: kunci yang disimpan pada aturan menunjuk ke fungsi di sini. Aksi baru (email,
// WhatsApp) ditambahkan di sini dan di ACTION_NAMES; kegagalan dilempar dan dicatat oleh emit().

export type HandlerContext = { teamId: number; ruleId: number };
export type Handler = (ctx: HandlerContext, config: Record<string, unknown>, payload: Record<string, unknown>) => Promise<void>;

async function recipients(teamId: number, mode: 'owners' | 'payload_user', payload: Record<string, unknown>): Promise<number[]> {
  const [members] = await withTenant(teamId, [
    db
      .select({ userId: teamMembers.userId, role: teamMembers.role })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId)),
  ]);
  if (mode === 'owners') return members.filter((m) => m.role === 'owner').map((m) => m.userId);
  const id = payload.userId;
  if (typeof id !== 'number' || !members.some((m) => m.userId === id)) {
    throw new Error('The event has no valid recipient (userId) in this team');
  }
  return [id];
}

const notify: Handler = async ({ teamId, ruleId }, rawConfig, payload) => {
  const config = notifyConfigSchema.parse(rawConfig);
  const users = await recipients(teamId, config.recipient, payload);
  if (users.length === 0) throw new Error('No recipients for this notification');
  const link = config.link ? render(config.link, payload) : null;
  await withTenant(teamId, [
    db.insert(autoNotifications).values(
      users.map((userId) => ({
        teamId,
        userId,
        ruleId,
        title: render(config.title, payload).slice(0, 200),
        body: config.body ? render(config.body, payload).slice(0, 500) : null,
        link: link && link.startsWith('/') && !link.startsWith('//') ? link.slice(0, 300) : null,
      }))
    ),
  ]);
};

export const HANDLERS: Record<string, Handler> = { notify };

