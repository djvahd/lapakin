import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
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
import type { ActivityInput, BoardQuery, ListQuery, MoveInput, OpportunityInput } from './schemas';

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
  | 'activity_not_found';

const DEFAULT_MESSAGES: Record<CrmErrorCode, string> = {
  not_found: 'Opportunity not found',
  archived: 'Restore the opportunity before editing',
  invalid_contact: 'Contact not found',
  invalid_stage: 'Stage not found',
  invalid_owner: 'The owner must be a member of this team',
  activity_not_found: 'Follow-up not found',
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
