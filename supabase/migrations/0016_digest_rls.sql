-- PermitKeep — Phase 10: RLS for jurisdiction_digest.
-- Unlike tenant tables, this is SHARED reference content (no account_id):
-- any authenticated user may read it. Writes go through the server/service
-- connection only (Claude generation + admin edits). No audit trigger —
-- it's regenerated monthly, not a tenant record.
ALTER TABLE public.jurisdiction_digest ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY jurisdiction_digest_read ON public.jurisdiction_digest
  FOR SELECT TO authenticated
  USING (true);
