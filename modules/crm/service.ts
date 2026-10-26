import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { teamMembers, users } from '@/lib/db/schema';
import { getContact, getContactNames } from '@/modules/contacts/service';
import {
  crmActivities,
  crmOpportunities,
  crmStages,
  type CrmActivity,
  type CrmOpportunity,
  type CrmStage,
} from './schema';
import type { ActivityInput, BoardQuery, ListQuery, MoveInput, OpportunityInput, StageInput } from './schemas';

// Layanan CRM. Semua fungsi menerima toko aktif dari getTenantContext(); semua query memfilter
// team_id secara eksplisit (lapis 1) dan berjalan lewat withTenant (RLS, lapis 2). Kontak diakses
// lewat fungsi publik modul Kontak, tidak lewat tabelnya.

export type Actor = { teamId: number; userId: number };

export type CrmErrorCode =
  | 'not_found'
  | 'archived'
  | 'invalid_contact'
  | 'invalid_stage'
  | 'invalid_owner'
  | 'activity_not_found'
  | 'stage_exists'
  | 'stage_locked'
  | 'stage_not_empty';

const DEFAULT_MESSAGES: Record<CrmErrorCode, string> = {
  not_found: 'Opportunity not found',
  archived: 'Restore the opportunity before editing',
  invalid_contact: 'Contact not found',
  invalid_stage: 'Stage not found',
  invalid_owner: 'The owner must be a member of this team',
  activity_not_found: 'Follow-up not found',
  stage_exists: 'A stage with this name already exists',
  stage_locked: 'This stage cannot be changed that way',
  stage_not_empty: 'Choose a stage to move its opportunities to',
};

export class CrmError extends Error {
  constructor(
    public code: CrmErrorCode,
    message?: string
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'CrmError';
  }
}

// Tahap bawaan, dibuat saat toko pertama kali memakai CRM (bukan lewat migrasi, karena toko
// dibuat saat sign-up).
const DEFAULT_STAGES = [
  { name: 'New', position: 0, kind: 'open', probability: 10 },
  { name: 'Qualified', position: 1, kind: 'open', probability: 25 },
  { name: 'Proposal', position: 2, kind: 'open', probability: 50 },
  { name: 'Negotiation', position: 3, kind: 'open', probability: 75 },
  { name: 'Won', position: 4, kind: 'won', probability: 100 },
  { name: 'Lost', position: 5, kind: 'lost', probability: 0 },
] as const;

// Papan memuat paling banyak ini peluang; jumlah dan total per tahap tetap dihitung penuh.
export const BOARD_LIMIT = 300;

export async function listStages(teamId: number): Promise<CrmStage[]> {
  const read = () =>
    withTenant(teamId, [
      db
        .select()
        .from(crmStages)
        .where(eq(crmStages.teamId, teamId))
        .orderBy(asc(crmStages.position), asc(crmStages.id)),
    ]).then(([rows]) => rows);

  const rows = await read();
  if (rows.length > 0) return rows;

  // Dua permintaan bersamaan sama-sama melihat toko kosong: konflik nama unik diabaikan.
  await withTenant(teamId, [
    db
      .insert(crmStages)
      .values(DEFAULT_STAGES.map((s) => ({ teamId, ...s })))
      .onConflictDoNothing(),
  ]);
  return read();
}

async function assertMember(teamId: number, userId: number) {
  const [row] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  if (!row) throw new CrmError('invalid_owner');
}

async function assertContact(teamId: number, contactId: number | null) {
  if (contactId === null) return;
  const contact = await getContact(teamId, contactId);
  if (!contact || contact.archivedAt) throw new CrmError('invalid_contact');
}

async function findOpportunity(teamId: number, id: number): Promise<CrmOpportunity | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(crmOpportunities)
      .where(and(eq(crmOpportunities.id, id), eq(crmOpportunities.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

const stageClosedFields = (stage: CrmStage, lostReason: string | null) => ({
  closedAt: stage.kind === 'open' ? null : new Date(),
  lostReason: stage.kind === 'lost' ? lostReason : null,
});

export type BoardItem = {
  id: number;
  title: string;
  contactId: number | null;
  contactName: string | null;
  expectedValue: number;
  expectedCloseDate: string | null;
  priority: number;
  ownerId: number | null;
  ownerName: string | null;
  stageId: number;
  openActivities: number;
  nextActivityDue: string | null;
};

export type BoardColumn = {
  stage: CrmStage;
  count: number;
  totalValue: number;
  weightedValue: number;
  items: BoardItem[];
  truncated: boolean;
};

async function ownerNames(ids: (number | null)[]) {
  const unique = [...new Set(ids.filter((i): i is number => i !== null))];
  const map = new Map<number, string>();
  if (unique.length === 0) return map;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, unique));
  for (const r of rows) map.set(r.id, r.name || r.email);
  return map;
}

export async function getBoard(teamId: number, query: BoardQuery): Promise<BoardColumn[]> {
  const stages = await listStages(teamId);

  const conditions = [eq(crmOpportunities.teamId, teamId), isNull(crmOpportunities.archivedAt)];
  if (query.q) conditions.push(ilike(crmOpportunities.title, `%${query.q.replace(/[\\%_]/g, '\\$&')}%`));
  if (query.ownerId) conditions.push(eq(crmOpportunities.ownerId, query.ownerId));
  const where = and(...conditions);

  const [aggregates, rows] = await withTenant(teamId, [
    db
      .select({
        stageId: crmOpportunities.stageId,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${crmOpportunities.expectedValue}), 0)::float8`,
      })
      .from(crmOpportunities)
      .where(where)
      .groupBy(crmOpportunities.stageId),
    db
      .select()
      .from(crmOpportunities)
      .where(where)
      .orderBy(
        desc(crmOpportunities.priority),
        sql`${crmOpportunities.expectedCloseDate} asc nulls last`,
        desc(crmOpportunities.id)
      )
      .limit(BOARD_LIMIT),
  ]);

  const [contactNames, owners, activityRows] = await Promise.all([
    getContactNames(teamId, rows.map((r) => r.contactId).filter((i): i is number => i !== null)),
    ownerNames(rows.map((r) => r.ownerId)),
    rows.length === 0
      ? Promise.resolve([] as { opportunityId: number; open: number; nextDue: string | null }[])
      : withTenant(teamId, [
          db
            .select({
              opportunityId: crmActivities.opportunityId,
              open: sql<number>`count(*)::int`,
              nextDue: sql<string | null>`min(${crmActivities.dueDate})::text`,
            })
            .from(crmActivities)
            .where(
              and(
                eq(crmActivities.teamId, teamId),
                isNull(crmActivities.doneAt),
                inArray(crmActivities.opportunityId, rows.map((r) => r.id))
              )
            )
            .groupBy(crmActivities.opportunityId),
        ]).then(([r]) => r),
  ]);
  const activityByOpp = new Map(activityRows.map((a) => [a.opportunityId, a]));
  const aggByStage = new Map(aggregates.map((a) => [a.stageId, a]));

  return stages.map((stage) => {
    const items = rows
      .filter((r) => r.stageId === stage.id)
      .map<BoardItem>((r) => ({
        id: r.id,
        title: r.title,
        contactId: r.contactId,
        contactName: r.contactId ? (contactNames.get(r.contactId)?.name ?? null) : null,
        expectedValue: r.expectedValue,
        expectedCloseDate: r.expectedCloseDate,
        priority: r.priority,
        ownerId: r.ownerId,
        ownerName: r.ownerId ? (owners.get(r.ownerId) ?? null) : null,
        stageId: r.stageId,
        openActivities: activityByOpp.get(r.id)?.open ?? 0,
        nextActivityDue: activityByOpp.get(r.id)?.nextDue ?? null,
      }));
    const agg = aggByStage.get(stage.id);
    const totalValue = agg?.total ?? 0;
    return {
      stage,
      count: agg?.count ?? 0,
      totalValue,
      weightedValue: Math.round(totalValue * stage.probability) / 100,
      items,
      truncated: (agg?.count ?? 0) > items.length,
    };
  });
}

export async function listOpportunities(teamId: number, query: ListQuery) {
  const conditions = [
    eq(crmOpportunities.teamId, teamId),
    query.archived ? isNotNull(crmOpportunities.archivedAt) : isNull(crmOpportunities.archivedAt),
  ];
  if (query.q) conditions.push(ilike(crmOpportunities.title, `%${query.q.replace(/[\\%_]/g, '\\$&')}%`));
  if (query.stageId) conditions.push(eq(crmOpportunities.stageId, query.stageId));
  if (query.ownerId) conditions.push(eq(crmOpportunities.ownerId, query.ownerId));
  const where = and(...conditions);

  const [rows, [{ total }]] = await withTenant(teamId, [
    db
      .select({ opportunity: crmOpportunities, stageName: crmStages.name, stageKind: crmStages.kind })
      .from(crmOpportunities)
      .innerJoin(
        crmStages,
        and(eq(crmOpportunities.stageId, crmStages.id), eq(crmStages.teamId, crmOpportunities.teamId))
      )
      .where(where)
      .orderBy(desc(crmOpportunities.createdAt), desc(crmOpportunities.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(crmOpportunities).where(where),
  ]);

  const names = await getContactNames(
    teamId,
    rows.map((r) => r.opportunity.contactId).filter((i): i is number => i !== null)
  );
  return {
    items: rows.map((r) => ({
      ...r.opportunity,
      stageName: r.stageName,
      stageKind: r.stageKind,
      contactName: r.opportunity.contactId ? (names.get(r.opportunity.contactId)?.name ?? null) : null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function listActivities(teamId: number, opportunityId: number) {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(crmActivities)
      .where(and(eq(crmActivities.teamId, teamId), eq(crmActivities.opportunityId, opportunityId)))
      .orderBy(sql`${crmActivities.doneAt} is not null`, asc(crmActivities.dueDate), asc(crmActivities.id)),
  ]);
  const owners = await ownerNames(rows.map((r) => r.assignedTo));
  return rows.map((r) => ({ ...r, assigneeName: r.assignedTo ? (owners.get(r.assignedTo) ?? null) : null }));
}

export async function getOpportunity(teamId: number, id: number) {
  const row = await findOpportunity(teamId, id);
  if (!row) return null;

  const [stages, names, owners, activities] = await Promise.all([
    listStages(teamId),
    row.contactId ? getContactNames(teamId, [row.contactId]) : Promise.resolve(new Map()),
    ownerNames([row.ownerId]),
    listActivities(teamId, id),
  ]);
  const stage = stages.find((s) => s.id === row.stageId)!;
  return {
    ...row,
    stage,
    stages,
    contactName: row.contactId ? ((names.get(row.contactId) as { name: string } | undefined)?.name ?? null) : null,
    ownerName: row.ownerId ? (owners.get(row.ownerId) ?? null) : null,
    activities,
  };
}

export async function createOpportunity(actor: Actor, input: OpportunityInput): Promise<CrmOpportunity> {
  const { teamId, userId } = actor;
  const stages = await listStages(teamId);
  const stage = input.stageId
    ? stages.find((s) => s.id === input.stageId)
    : stages.find((s) => s.kind === 'open');
  if (!stage) throw new CrmError('invalid_stage');

  const ownerId = input.ownerId ?? userId;
  await assertContact(teamId, input.contactId);
  await assertMember(teamId, ownerId);

  const [[created]] = await withTenant(teamId, [
    db
      .insert(crmOpportunities)
      .values({
        teamId,
        title: input.title,
        contactId: input.contactId,
        stageId: stage.id,
        expectedValue: input.expectedValue,
        expectedCloseDate: input.expectedCloseDate,
        priority: input.priority,
        ownerId,
        notes: input.notes,
        createdBy: userId,
        ...stageClosedFields(stage, null),
      })
      .returning(),
  ]);

  await withTenant(teamId, [
    auditEntry(teamId, userId, 'CRM_OPPORTUNITY_CREATED', {
      entityType: 'crm_opportunity',
      entityId: created.id,
      metadata: { title: created.title, stage: stage.name },
    }),
  ]);
  return created;
}

// Tahap tidak diubah di sini (input.stageId diabaikan): gunakan moveOpportunity.
export async function updateOpportunity(actor: Actor, id: number, input: OpportunityInput): Promise<CrmOpportunity> {
  const { teamId, userId } = actor;
  const existing = await findOpportunity(teamId, id);
  if (!existing) throw new CrmError('not_found');
  if (existing.archivedAt) throw new CrmError('archived');

  const ownerId = input.ownerId ?? existing.ownerId;
  if (input.contactId !== existing.contactId) await assertContact(teamId, input.contactId);
  if (ownerId !== null && ownerId !== existing.ownerId) await assertMember(teamId, ownerId);

  const results = await withTenant(teamId, [
    db
      .update(crmOpportunities)
      .set({
        title: input.title,
        contactId: input.contactId,
        expectedValue: input.expectedValue,
        expectedCloseDate: input.expectedCloseDate,
        priority: input.priority,
        ownerId,
        notes: input.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(crmOpportunities.id, id), eq(crmOpportunities.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, 'CRM_OPPORTUNITY_UPDATED', {
      entityType: 'crm_opportunity',
      entityId: id,
      metadata: { title: input.title },
    }),
  ]);
  return (results[0] as CrmOpportunity[])[0];
}

export async function moveOpportunity(actor: Actor, id: number, input: MoveInput): Promise<CrmOpportunity> {
  const { teamId, userId } = actor;
  const existing = await findOpportunity(teamId, id);
  if (!existing) throw new CrmError('not_found');
  if (existing.archivedAt) throw new CrmError('archived');

  const stages = await listStages(teamId);
  const to = stages.find((s) => s.id === input.stageId);
  if (!to) throw new CrmError('invalid_stage');
  const from = stages.find((s) => s.id === existing.stageId);
  if (to.id === existing.stageId) return existing;

  const results = await withTenant(teamId, [
    db
      .update(crmOpportunities)
      .set({ stageId: to.id, ...stageClosedFields(to, input.lostReason), updatedAt: new Date() })
      .where(and(eq(crmOpportunities.id, id), eq(crmOpportunities.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, 'CRM_OPPORTUNITY_MOVED', {
      entityType: 'crm_opportunity',
      entityId: id,
      metadata: { title: existing.title, fromStage: from?.name ?? null, toStage: to.name },
    }),
  ]);
  return (results[0] as CrmOpportunity[])[0];
}

async function setArchived(actor: Actor, id: number, archived: boolean): Promise<CrmOpportunity> {
  const { teamId, userId } = actor;
  const existing = await findOpportunity(teamId, id);
  if (!existing) throw new CrmError('not_found');
  if (Boolean(existing.archivedAt) === archived) return existing;

  const results = await withTenant(teamId, [
    db
      .update(crmOpportunities)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(and(eq(crmOpportunities.id, id), eq(crmOpportunities.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, archived ? 'CRM_OPPORTUNITY_ARCHIVED' : 'CRM_OPPORTUNITY_RESTORED', {
      entityType: 'crm_opportunity',
      entityId: id,
      metadata: { title: existing.title },
    }),
  ]);
  return (results[0] as CrmOpportunity[])[0];
}

export const archiveOpportunity = (actor: Actor, id: number) => setArchived(actor, id, true);
export const restoreOpportunity = (actor: Actor, id: number) => setArchived(actor, id, false);

export async function createActivity(actor: Actor, input: ActivityInput): Promise<CrmActivity> {
  const { teamId, userId } = actor;
  const opportunity = await findOpportunity(teamId, input.opportunityId);
  if (!opportunity) throw new CrmError('not_found');
  if (opportunity.archivedAt) throw new CrmError('archived');

  const assignedTo = input.assignedTo ?? userId;
  await assertMember(teamId, assignedTo);

  const results = await withTenant(teamId, [
    db
      .insert(crmActivities)
      .values({
        teamId,
        opportunityId: input.opportunityId,
        kind: input.kind,
        summary: input.summary,
        dueDate: input.dueDate,
        assignedTo,
        createdBy: userId,
      })
      .returning(),
    auditEntry(teamId, userId, 'CRM_ACTIVITY_CREATED', {
      entityType: 'crm_opportunity',
      entityId: input.opportunityId,
      metadata: { title: opportunity.title, summary: input.summary },
    }),
  ]);
  return (results[0] as CrmActivity[])[0];
}

async function setActivityDone(actor: Actor, id: number, done: boolean): Promise<CrmActivity> {
  const { teamId, userId } = actor;
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(crmActivities)
      .where(and(eq(crmActivities.id, id), eq(crmActivities.teamId, teamId)))
      .limit(1),
  ]);
  const existing = rows[0];
  if (!existing) throw new CrmError('activity_not_found');
  if (Boolean(existing.doneAt) === done) return existing;

  const results = await withTenant(teamId, [
    db
      .update(crmActivities)
      .set({ doneAt: done ? new Date() : null })
      .where(and(eq(crmActivities.id, id), eq(crmActivities.teamId, teamId)))
      .returning(),
    auditEntry(teamId, userId, done ? 'CRM_ACTIVITY_DONE' : 'CRM_ACTIVITY_REOPENED', {
      entityType: 'crm_opportunity',
      entityId: existing.opportunityId,
      metadata: { summary: existing.summary },
    }),
  ]);
  return (results[0] as CrmActivity[])[0];
}

export const completeActivity = (actor: Actor, id: number) => setActivityDone(actor, id, true);
export const reopenActivity = (actor: Actor, id: number) => setActivityDone(actor, id, false);

// ---------------------------------------------------------------------------
// Kelola tahap
// ---------------------------------------------------------------------------

const sqlState = (e: unknown): string | undefined =>
  (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;

// Urutan kanonik: tahap terbuka (menurut posisi), lalu Won, lalu Lost. Won dan Lost selalu di ujung.
function canonicalOrder(stages: CrmStage[]): CrmStage[] {
  const sorted = [...stages].sort((a, b) => a.position - b.position || a.id - b.id);
  return [
    ...sorted.filter((s) => s.kind === 'open'),
    ...sorted.filter((s) => s.kind === 'won'),
    ...sorted.filter((s) => s.kind === 'lost'),
  ];
}

// Perintah UPDATE hanya untuk tahap yang posisinya berubah, agar posisi kembali 0..n-1.
const positionUpdates = (teamId: number, ordered: CrmStage[]) =>
  ordered.flatMap((s, i) =>
    s.position === i
      ? []
      : [db.update(crmStages).set({ position: i }).where(and(eq(crmStages.id, s.id), eq(crmStages.teamId, teamId)))]
  );

export async function listStageUsage(teamId: number) {
  const stages = await listStages(teamId);
  const [rows] = await withTenant(teamId, [
    db
      .select({ stageId: crmOpportunities.stageId, n: sql<number>`count(*)::int` })
      .from(crmOpportunities)
      .where(eq(crmOpportunities.teamId, teamId))
      .groupBy(crmOpportunities.stageId),
  ]);
  const counts = new Map(rows.map((r) => [r.stageId, r.n]));
  return stages.map((s) => ({ ...s, opportunityCount: counts.get(s.id) ?? 0 }));
}

// Tahap baru selalu terbuka dan masuk tepat sebelum Won; Won dan Lost bergeser satu posisi.
export async function createStage(actor: Actor, input: StageInput): Promise<CrmStage> {
  const { teamId, userId } = actor;
  const ordered = canonicalOrder(await listStages(teamId));
  const openCount = ordered.filter((s) => s.kind === 'open').length;

  try {
    const results = await withTenant(teamId, [
      db
        .update(crmStages)
        .set({ position: sql`${crmStages.position} + 1` })
        .where(and(eq(crmStages.teamId, teamId), ne(crmStages.kind, 'open'))),
      db
        .insert(crmStages)
        .values({ teamId, name: input.name, position: openCount, kind: 'open', probability: input.probability })
        .returning(),
      auditEntry(teamId, userId, 'CRM_STAGE_CREATED', {
        entityType: 'crm_stage',
        metadata: { name: input.name },
      }),
    ]);
    return (results[1] as CrmStage[])[0];
  } catch (e) {
    if (sqlState(e) === '23505') throw new CrmError('stage_exists');
    throw e;
  }
}

// Won selalu 100% dan Lost selalu 0%: probabilitas dari input hanya berlaku untuk tahap terbuka.
export async function updateStage(actor: Actor, id: number, input: StageInput): Promise<CrmStage> {
  const { teamId, userId } = actor;
  const stage = (await listStages(teamId)).find((s) => s.id === id);
  if (!stage) throw new CrmError('invalid_stage');
  const probability = stage.kind === 'won' ? 100 : stage.kind === 'lost' ? 0 : input.probability;

  try {
    const results = await withTenant(teamId, [
      db
        .update(crmStages)
        .set({ name: input.name, probability })
        .where(and(eq(crmStages.id, id), eq(crmStages.teamId, teamId)))
        .returning(),
      auditEntry(teamId, userId, 'CRM_STAGE_UPDATED', {
        entityType: 'crm_stage',
        entityId: id,
        metadata: { name: input.name, previousName: stage.name },
      }),
    ]);
    return (results[0] as CrmStage[])[0];
  } catch (e) {
    if (sqlState(e) === '23505') throw new CrmError('stage_exists');
    throw e;
  }
}

// Menukar posisi tahap terbuka dengan tetangganya. Di ujung daftar tidak berbuat apa-apa.
export async function moveStage(actor: Actor, id: number, direction: 'up' | 'down'): Promise<CrmStage[]> {
  const { teamId, userId } = actor;
  const ordered = canonicalOrder(await listStages(teamId));
  const index = ordered.findIndex((s) => s.id === id);
  if (index === -1) throw new CrmError('invalid_stage');
  if (ordered[index].kind !== 'open') {
    throw new CrmError('stage_locked', 'Won and Lost always stay at the end');
  }

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || ordered[target].kind !== 'open') return ordered;

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const updates = positionUpdates(teamId, ordered);
  if (updates.length === 0) return ordered;

  const queries: BatchItem<'pg'>[] = [
    ...updates,
    auditEntry(teamId, userId, 'CRM_STAGE_MOVED', {
      entityType: 'crm_stage',
      entityId: id,
      metadata: { name: ordered[target].name, direction },
    }),
  ];
  await withTenant(teamId, queries as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
  return ordered.map((s, i) => ({ ...s, position: i }));
}

// Menghapus tahap terbuka. Peluang di dalamnya (termasuk yang diarsipkan) dipindah ke `moveTo`
// dalam transaksi yang sama. Won, Lost, dan satu-satunya tahap terbuka tidak bisa dihapus.
export async function deleteStage(actor: Actor, id: number, moveTo: number | null): Promise<{ moved: number }> {
  const { teamId, userId } = actor;
  const stages = await listStages(teamId);
  const stage = stages.find((s) => s.id === id);
  if (!stage) throw new CrmError('invalid_stage');
  if (stage.kind !== 'open') throw new CrmError('stage_locked', 'Won and Lost cannot be deleted');
  if (stages.filter((s) => s.kind === 'open').length <= 1) {
    throw new CrmError('stage_locked', 'The pipeline needs at least one open stage');
  }

  const [[usage]] = await withTenant(teamId, [
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(crmOpportunities)
      .where(and(eq(crmOpportunities.stageId, id), eq(crmOpportunities.teamId, teamId))),
  ]);

  let target: CrmStage | undefined;
  if (usage.n > 0) {
    if (moveTo === null) throw new CrmError('stage_not_empty');
    target = stages.find((s) => s.id === moveTo && s.id !== id);
    if (!target) throw new CrmError('invalid_stage');
  }

  const remaining = canonicalOrder(stages.filter((s) => s.id !== id));
  const queries: BatchItem<'pg'>[] = [];
  if (target) {
    queries.push(
      db
        .update(crmOpportunities)
        .set({ stageId: target.id, ...stageClosedFields(target, null), updatedAt: new Date() })
        .where(and(eq(crmOpportunities.stageId, id), eq(crmOpportunities.teamId, teamId)))
    );
  }
  queries.push(db.delete(crmStages).where(and(eq(crmStages.id, id), eq(crmStages.teamId, teamId))));
  queries.push(...positionUpdates(teamId, remaining));
  queries.push(
    auditEntry(teamId, userId, 'CRM_STAGE_DELETED', {
      entityType: 'crm_stage',
      entityId: id,
      metadata: { name: stage.name, moved: usage.n, movedTo: target?.name ?? null },
    })
  );

  await withTenant(teamId, queries as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
  return { moved: usage.n };
}

// ---------------------------------------------------------------------------
// Ringkasan tindak lanjut
// ---------------------------------------------------------------------------

export type FollowUp = {
  id: number;
  kind: string;
  summary: string;
  dueDate: string;
  assignedTo: number | null;
  assigneeName: string | null;
  opportunityId: number;
  opportunityTitle: string;
};

// Tindak lanjut yang belum selesai pada peluang yang tidak diarsipkan, urut menurut jatuh tempo.
export async function listFollowUps(
  teamId: number,
  options: { assignedTo?: number; limit?: number } = {}
): Promise<FollowUp[]> {
  const conditions = [
    eq(crmActivities.teamId, teamId),
    isNull(crmActivities.doneAt),
    isNull(crmOpportunities.archivedAt),
  ];
  if (options.assignedTo) conditions.push(eq(crmActivities.assignedTo, options.assignedTo));

  const [rows] = await withTenant(teamId, [
    db
      .select({
        id: crmActivities.id,
        kind: crmActivities.kind,
        summary: crmActivities.summary,
        dueDate: crmActivities.dueDate,
        assignedTo: crmActivities.assignedTo,
        opportunityId: crmActivities.opportunityId,
        opportunityTitle: crmOpportunities.title,
      })
      .from(crmActivities)
      .innerJoin(
        crmOpportunities,
        and(eq(crmActivities.opportunityId, crmOpportunities.id), eq(crmOpportunities.teamId, crmActivities.teamId))
      )
      .where(and(...conditions))
      .orderBy(asc(crmActivities.dueDate), asc(crmActivities.id))
      .limit(options.limit ?? 200),
  ]);

  const names = await ownerNames(rows.map((r) => r.assignedTo));
  return rows.map((r) => ({ ...r, assigneeName: r.assignedTo ? (names.get(r.assignedTo) ?? null) : null }));
}

// Jumlah tindak lanjut terlambat milik seseorang (jatuh tempo sebelum `today`, format YYYY-MM-DD).
export async function countOverdueFollowUps(teamId: number, userId: number, today: string): Promise<number> {
  const [[row]] = await withTenant(teamId, [
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(crmActivities)
      .innerJoin(
        crmOpportunities,
        and(eq(crmActivities.opportunityId, crmOpportunities.id), eq(crmOpportunities.teamId, crmActivities.teamId))
      )
      .where(
        and(
          eq(crmActivities.teamId, teamId),
          eq(crmActivities.assignedTo, userId),
          isNull(crmActivities.doneAt),
          isNull(crmOpportunities.archivedAt),
          lt(crmActivities.dueDate, today)
        )
      ),
  ]);
  return row.n;
}
