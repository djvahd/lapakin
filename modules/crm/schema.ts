import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  date,
  numeric,
  timestamp,
  unique,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Impor relatif: drizzle-kit tidak memahami alias '@/'.
import { teams, users, tenantIsolation } from '../../lib/db/schema';
import { contacts } from '../contacts/schema';

export const STAGE_KINDS = ['open', 'won', 'lost'] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const ACTIVITY_KINDS = ['call', 'email', 'meeting', 'todo'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

// Tahap pipeline per toko. Tahap bawaan dibuat saat toko pertama kali memakai CRM (lihat service).
export const crmStages = pgTable(
  'crm_stages',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    name: varchar('name', { length: 50 }).notNull(),
    position: integer('position').notNull(),
    // open: peluang masih berjalan; won dan lost: peluang selesai.
    kind: varchar('kind', { length: 10 }).notNull().default('open'),
    // Persen peluang menang pada tahap ini, dasar nilai tertimbang.
    probability: integer('probability').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    unique('crm_stages_id_team_unique').on(t.id, t.teamId),
    uniqueIndex('crm_stages_team_name_unique').on(t.teamId, sql`lower(${t.name})`),
    check('crm_stages_kind_check', sql`${t.kind} in ('open', 'won', 'lost')`),
    check('crm_stages_probability_check', sql`${t.probability} between 0 and 100`),
    index('crm_stages_team_position_idx').on(t.teamId, t.position),
  ]
);

// Peluang penjualan (crm.lead di Odoo).
export const crmOpportunities = pgTable(
  'crm_opportunities',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    title: varchar('title', { length: 200 }).notNull(),
    contactId: integer('contact_id'),
    stageId: integer('stage_id').notNull(),
    expectedValue: numeric('expected_value', { precision: 14, scale: 2, mode: 'number' }).notNull().default(0),
    expectedCloseDate: date('expected_close_date'),
    // 0 biasa, 1 sedang, 2 tinggi, 3 sangat tinggi.
    priority: integer('priority').notNull().default(0),
    ownerId: integer('owner_id').references(() => users.id),
    lostReason: text('lost_reason'),
    notes: text('notes'),
    closedAt: timestamp('closed_at'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    archivedAt: timestamp('archived_at'),
  },
  (t) => [
    tenantIsolation(),
    unique('crm_opportunities_id_team_unique').on(t.id, t.teamId),
    foreignKey({
      name: 'crm_opportunities_contact_fk',
      columns: [t.contactId, t.teamId],
      foreignColumns: [contacts.id, contacts.teamId],
    }),
    foreignKey({
      name: 'crm_opportunities_stage_fk',
      columns: [t.stageId, t.teamId],
      foreignColumns: [crmStages.id, crmStages.teamId],
    }),
    check('crm_opportunities_value_check', sql`${t.expectedValue} >= 0`),
    check('crm_opportunities_priority_check', sql`${t.priority} between 0 and 3`),
    index('crm_opportunities_team_stage_idx').on(t.teamId, t.stageId),
    index('crm_opportunities_team_owner_idx').on(t.teamId, t.ownerId),
  ]
);

// Tindak lanjut pada peluang (mail.activity di Odoo).
export const crmActivities = pgTable(
  'crm_activities',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    opportunityId: integer('opportunity_id').notNull(),
    kind: varchar('kind', { length: 10 }).notNull(),
    summary: varchar('summary', { length: 200 }).notNull(),
    dueDate: date('due_date').notNull(),
    assignedTo: integer('assigned_to').references(() => users.id),
    doneAt: timestamp('done_at'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    foreignKey({
      name: 'crm_activities_opportunity_fk',
      columns: [t.opportunityId, t.teamId],
      foreignColumns: [crmOpportunities.id, crmOpportunities.teamId],
    }),
    check('crm_activities_kind_check', sql`${t.kind} in ('call', 'email', 'meeting', 'todo')`),
    index('crm_activities_opportunity_idx').on(t.opportunityId),
    index('crm_activities_team_due_idx').on(t.teamId, t.dueDate),
  ]
);

export type CrmStage = typeof crmStages.$inferSelect;
export type CrmOpportunity = typeof crmOpportunities.$inferSelect;
export type CrmActivity = typeof crmActivities.$inferSelect;
