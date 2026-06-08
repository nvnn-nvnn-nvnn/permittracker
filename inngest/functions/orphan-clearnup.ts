import { inngest } from "@/inngest/client";
import { deleteAbandonedOrphans } from "@/lib/files/cleanup";


/**
 * Daily cleanup of abandoned orphan files — uploaded + OCR'd but the user
 * never created an item (complianceItemId stays null). Deletes the storage
 * object + row (proposals cascade) for orphans older than 24h.
 */



export const orphanCleanupCron = inngest.createFunction(
    { id: "orphan-file-cleanup", triggers: [{ cron: "0 4 * * * "}]},
    async ({step}) => {
        const {deleted} = await step.run("delete-orphans", () => 
        deleteAbandonedOrphans(24),
    
    );
    return {deleted};
    },
   
    

);


