-- PermitKeep — Operations pillar (v1.1): RLS for inventory_usage.
-- Member-scoped reads; writes via the server/service connection (the sync
-- depletion engine). Synced/recomputable data — NOT wired to the audit_log.
ALTER TABLE public.inventory_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inventory_usage_member_select ON public.inventory_usage
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
