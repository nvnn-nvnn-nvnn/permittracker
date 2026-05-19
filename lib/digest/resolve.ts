import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  complianceItem,
  jurisdictionDigest,
  truck,
} from "@/lib/db/schema";
import type { JurisdictionDigest } from "@/lib/db/schema";

/**
 * The distinct jurisdictions an account actually operates in — derived from
 * its (non-archived) trucks and compliance items. Drives which digests it
 * sees / is emailed.
 */
export async function accountJurisdictions(
  accountId: string,
): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ j: truck.jurisdiction })
    .from(truck)
    .where(
      and(eq(truck.accountId, accountId), isNull(truck.archivedAt)),
    )
    .union(
      db
        .select({ j: complianceItem.jurisdiction })
        .from(complianceItem)
        .where(
          and(
            eq(complianceItem.accountId, accountId),
            isNull(complianceItem.archivedAt),
          ),
        ),
    );
  return [
    ...new Set(
      rows
        .map((r) => r.j?.trim())
        .filter((j): j is string => Boolean(j)),
    ),
  ];
}

/** Published digests for the account's jurisdictions in a given period. */
export async function digestsForAccount(
  accountId: string,
  period: string,
): Promise<JurisdictionDigest[]> {
  const jurisdictions = await accountJurisdictions(accountId);
  if (jurisdictions.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(jurisdictionDigest)
    .where(
      and(
        eq(jurisdictionDigest.period, period),
        eq(jurisdictionDigest.status, "published"),
        inArray(jurisdictionDigest.jurisdiction, jurisdictions),
      ),
    )
    .orderBy(sql`${jurisdictionDigest.jurisdiction} asc`);
}
