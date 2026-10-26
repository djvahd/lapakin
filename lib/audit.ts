import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';

type AuditOptions = {
  ipAddress?: string;
  entityType?: string;
  entityId?: number;
  metadata?: Record<string, unknown>;
};

// Query penulisan audit, untuk dimasukkan ke batch withTenant bersama perubahan datanya
// sehingga keduanya atomik. Tidak dijalankan sampai dipakai di withTenant.
export function auditEntry(
  teamId: number,
  userId: number | null,
  action: string,
  options: AuditOptions = {}
) {
  return db.insert(activityLogs).values({
    teamId,
    userId,
    action,
    ipAddress: options.ipAddress ?? '',
    entityType: options.entityType,
    entityId: options.entityId,
    metadata: options.metadata,
  });
}

// Mencatat aktivitas ke audit log toko. Modul memakai ini untuk peristiwa bisnis,
// misalnya audit(teamId, userId, 'ORDER_CREATED', { entityType: 'order', entityId: 7 }).
export async function audit(
  teamId: number,
  userId: number | null,
  action: string,
  options: AuditOptions = {}
) {
  await withTenant(teamId, [auditEntry(teamId, userId, action, options)]);
}
