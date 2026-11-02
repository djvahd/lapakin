import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { matches } from './engine';
import type { EventName, EventPayload } from './events';
import { HANDLERS } from './handlers';
import { autoNotifications, autoRules, autoRuns, type AutoNotification, type AutoRule, type AutoRun } from './schema';
import type { RuleInput } from './schemas';

// Mesin otomasi: modul memanggil emit(teamId, peristiwa, payload); aturan aktif yang pemicunya cocok
// dan kondisinya terpenuhi menjalankan aksinya, dan setiap eksekusi dicatat (berhasil atau gagal).
// Semua query memfilter team_id (lapis 1) dan berjalan lewat withTenant (RLS).

export type Actor = { teamId: number; userId: number };

export type AutomationErrorCode = 'not_found';

export class AutomationError extends Error {
  constructor(
    public code: AutomationErrorCode,
    message = 'Rule not found'
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

// ---------------------------------------------------------------------------
// Aturan
// ---------------------------------------------------------------------------

export async function listRules(teamId: number): Promise<AutoRule[]> {
  const [rows] = await withTenant(teamId, [
    db.select().from(autoRules).where(eq(autoRules.teamId, teamId)).orderBy(desc(autoRules.id)),
  ]);
  return rows;
}

export async function getRule(teamId: number, id: number): Promise<AutoRule | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(autoRules)
      .where(and(eq(autoRules.id, id), eq(autoRules.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

export async function createRule(actor: Actor, input: RuleInput): Promise<AutoRule> {
  const { teamId, userId } = actor;
  const [[created]] = await withTenant(teamId, [
    db
      .insert(autoRules)
      .values({
        teamId,
        name: input.name,
        event: input.event,
        conditions: input.conditions,
        action: input.action,
        actionConfig: input.actionConfig,
        active: input.active,
        createdBy: userId,
      })
      .returning(),
  ]);
  await withTenant(teamId, [
    auditEntry(teamId, userId, 'AUTOMATION_RULE_CREATED', {
      entityType: 'auto_rule',
      entityId: created.id,
      metadata: { name: created.name },
    }),
  ]);
  return created;
}

export async function updateRule(actor: Actor, id: number, input: RuleInput): Promise<AutoRule> {
  const { teamId, userId } = actor;
  const [rows] = await withTenant(teamId, [
    db
      .update(autoRules)
      .set({
        name: input.name,
        event: input.event,
        conditions: input.conditions,
        action: input.action,
        actionConfig: input.actionConfig,
        active: input.active,
        updatedAt: new Date(),
      })
      .where(and(eq(autoRules.id, id), eq(autoRules.teamId, teamId)))
      .returning(),
  ]);
  if (rows.length === 0) throw new AutomationError('not_found');
  await withTenant(teamId, [
    auditEntry(teamId, userId, 'AUTOMATION_RULE_UPDATED', {
      entityType: 'auto_rule',
      entityId: id,
      metadata: { name: rows[0].name },
    }),
  ]);
  return rows[0];
}

export async function setRuleActive(actor: Actor, id: number, active: boolean): Promise<AutoRule> {
  const { teamId, userId } = actor;
  const [rows] = await withTenant(teamId, [
    db
      .update(autoRules)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(autoRules.id, id), eq(autoRules.teamId, teamId)))
      .returning(),
  ]);
  if (rows.length === 0) throw new AutomationError('not_found');
  await withTenant(teamId, [
    auditEntry(teamId, userId, active ? 'AUTOMATION_RULE_ENABLED' : 'AUTOMATION_RULE_DISABLED', {
      entityType: 'auto_rule',
      entityId: id,
      metadata: { name: rows[0].name },
    }),
  ]);
  return rows[0];
}

// Menghapus aturan beserta catatan eksekusinya (kunci asing cascade).
export async function deleteRule(actor: Actor, id: number): Promise<void> {
  const { teamId, userId } = actor;
  const [rows] = await withTenant(teamId, [
    db
      .delete(autoRules)
      .where(and(eq(autoRules.id, id), eq(autoRules.teamId, teamId)))
      .returning(),
  ]);
  if (rows.length === 0) throw new AutomationError('not_found');
  await withTenant(teamId, [
    auditEntry(teamId, userId, 'AUTOMATION_RULE_DELETED', {
      entityType: 'auto_rule',
      entityId: id,
      metadata: { name: rows[0].name },
    }),
  ]);
}

export async function listRuns(teamId: number, opts: { ruleId?: number; limit?: number } = {}): Promise<AutoRun[]> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(autoRuns)
      .where(and(eq(autoRuns.teamId, teamId), opts.ruleId ? eq(autoRuns.ruleId, opts.ruleId) : undefined))
      .orderBy(desc(autoRuns.id))
      .limit(Math.min(opts.limit ?? 50, 200)),
  ]);
  return rows;
}

// ---------------------------------------------------------------------------
// Peristiwa
// ---------------------------------------------------------------------------

export type EmitResult = { ok: number; failed: number; skipped: number };

// Fungsi publik untuk modul lain. Tidak pernah melempar karena aksi gagal: kegagalan dicatat pada
// auto_runs dan dihitung di hasil, sehingga pemanggil (mis. pemindai terjadwal) tetap berjalan.
// Dengan `payload.dedupeKey`, aturan yang sama tidak berjalan dua kali untuk kunci yang sama.
export async function emit(teamId: number, event: EventName, payload: EventPayload = {}): Promise<EmitResult> {
  const result: EmitResult = { ok: 0, failed: 0, skipped: 0 };
  const [rules] = await withTenant(teamId, [
    db
      .select()
      .from(autoRules)
      .where(and(eq(autoRules.teamId, teamId), eq(autoRules.event, event), eq(autoRules.active, true))),
  ]);

  for (const rule of rules) {
    if (!matches(rule.conditions, payload)) continue;

    // Klaim dulu: indeks unik (aturan, kunci) membuat pemanggil bersamaan hanya satu yang menang.
    const dedupeKey = payload.dedupeKey ? String(payload.dedupeKey).slice(0, 200) : null;
    const [claimed] = await withTenant(teamId, [
      db
        .insert(autoRuns)
        .values({ teamId, ruleId: rule.id, event, payload, dedupeKey })
        .onConflictDoNothing()
        .returning({ id: autoRuns.id }),
    ]);
    if (claimed.length === 0) {
      result.skipped++;
      continue;
    }

    const runId = claimed[0].id;
    let error: string | null = null;
    try {
      const handler = HANDLERS[rule.action];
      if (!handler) throw new Error(`Unknown action "${rule.action}"`);
      await handler({ teamId, ruleId: rule.id }, rule.actionConfig, payload);
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    }
    await withTenant(teamId, [
      db
        .update(autoRuns)
        .set({ status: error ? 'failed' : 'ok', error })
        .where(and(eq(autoRuns.id, runId), eq(autoRuns.teamId, teamId))),
    ]);
    if (error) result.failed++;
    else result.ok++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------

export async function listNotifications(teamId: number, userId: number, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(autoNotifications)
      .where(
        and(
          eq(autoNotifications.teamId, teamId),
          eq(autoNotifications.userId, userId),
          opts.unreadOnly ? isNull(autoNotifications.readAt) : undefined
        )
      )
      .orderBy(desc(autoNotifications.id))
      .limit(Math.min(opts.limit ?? 30, 100)),
  ]);
  return rows as AutoNotification[];
}

export async function countUnread(teamId: number, userId: number): Promise<number> {
  const [rows] = await withTenant(teamId, [
    db
      .select({ n: count() })
      .from(autoNotifications)
      .where(and(eq(autoNotifications.teamId, teamId), eq(autoNotifications.userId, userId), isNull(autoNotifications.readAt))),
  ]);
  return rows[0].n;
}

// id kosong berarti semua notifikasi pengguna ini. Pengguna hanya bisa menandai miliknya sendiri.
export async function markRead(teamId: number, userId: number, id?: number): Promise<number> {
  const [rows] = await withTenant(teamId, [
    db
      .update(autoNotifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(autoNotifications.teamId, teamId),
          eq(autoNotifications.userId, userId),
          isNull(autoNotifications.readAt),
          id ? eq(autoNotifications.id, id) : undefined
        )
      )
      .returning({ id: autoNotifications.id }),
  ]);
  return rows.length;
}
