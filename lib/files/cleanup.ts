
import "server-only";
import { getDb } from "../db"
import { fileAttachment } from "../db/schema"
import {and, eq, isNull, lt} from "drizzle-orm"
import { deleteBytes } from "../storage"



export async function deleteAbandonedOrphans(
  olderThanHours = 24,
): Promise<{ deleted: number }> {
  // ← body goes HERE, inside these braces

  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);


    const orphans = await db
    .select({
        id: fileAttachment.id,
        storagePath: fileAttachment.storagePath
    })
    .from(fileAttachment)
    .where(
        and(
            isNull(fileAttachment.complianceItemId),
            lt(fileAttachment.createdAt, cutoff)
        )
    );

    let deleted = 0;
    for (const f of orphans){

        try {
            await deleteBytes(f.storagePath);
            await db.delete(fileAttachment).where(eq(fileAttachment.id, f.id));
            deleted++;
        } catch {

        }







    }

     return {deleted};


}