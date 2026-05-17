import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { AuditLog } from "@/lib/db/schema";

/**
 * Read audit history for one entity. WRITES happen only via the Postgres
 * trigger — there is intentionally no write function here.
 */
export async function listAuditForEntity(
  accountId: string,
  entityType: "truck" | "compliance_item",
  entityId: string,
): Promise<AuditLog[]> {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.accountId, accountId),
        eq(auditLog.entityType, entityType),
        eq(auditLog.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLog.createdAt));
}
