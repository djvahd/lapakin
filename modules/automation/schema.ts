import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  jsonb,
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

export const CONDITION_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

// Satu kondisi membandingkan satu bidang payload peristiwa; semua kondisi aturan harus terpenuhi.
export type Condition = { field: string; op: ConditionOp; value: string | number | boolean };

export const RUN_STATUSES = ['running', 'ok', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

// Aturan otomasi (pemicu, kondisi, aksi). Pemicu adalah nama peristiwa domain (lihat events.ts),
// aksi adalah kunci pada registry aksi (lihat actions.ts) dengan konfigurasinya.
export const autoRules = pgTable(
  'auto_rules',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    name: varchar('name', { length: 100 }).notNull(),
    event: varchar('event', { length: 50 }).notNull(),
    conditions: jsonb('conditions').$type<Condition[]>().notNull().default([]),
    action: varchar('action', { length: 30 }).notNull(),
    actionConfig: jsonb('action_config').$type<Record<string, unknown>>().notNull().default({}),
    active: boolean('active').notNull().default(true),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    unique('auto_rules_id_team_unique').on(t.id, t.teamId),
    index('auto_rules_team_event_idx').on(t.teamId, t.event),
  ]
);

// Catatan eksekusi aturan: berhasil atau gagal beserta alasannya. `dedupeKey` mencegah satu aturan
// berjalan dua kali untuk hal yang sama (mis. pengingat yang sama untuk faktur yang sama).
export const autoRuns = pgTable(
  'auto_runs',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    ruleId: integer('rule_id').notNull(),
    event: varchar('event', { length: 50 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    dedupeKey: varchar('dedupe_key', { length: 200 }),
    status: varchar('status', { length: 10 }).notNull().default('running'),
    error: varchar('error', { length: 500 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    foreignKey({
      name: 'auto_runs_rule_fk',
      columns: [t.ruleId, t.teamId],
      foreignColumns: [autoRules.id, autoRules.teamId],
    }).onDelete('cascade'),
    uniqueIndex('auto_runs_rule_dedupe_unique').on(t.ruleId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
    check('auto_runs_status_check', sql`${t.status} in ('running', 'ok', 'failed')`),
    index('auto_runs_team_created_idx').on(t.teamId, t.createdAt),
  ]
);

// Notifikasi di dalam aplikasi untuk satu pengguna; aksi `notify` membuatnya.
export const autoNotifications = pgTable(
  'auto_notifications',
  {
    id: serial('id').primaryKey(),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 500 }),
    link: varchar('link', { length: 300 }),
    // Informasi saja, tanpa kunci asing: notifikasi tetap ada walau aturannya dihapus.
    ruleId: integer('rule_id'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    tenantIsolation(),
    index('auto_notifications_user_idx').on(t.teamId, t.userId, t.readAt),
  ]
);

export type AutoRule = typeof autoRules.$inferSelect;
export type AutoRun = typeof autoRuns.$inferSelect;
export type AutoNotification = typeof autoNotifications.$inferSelect;
