-- PermitKeep — Operations pillar (Tier A, step 5): RLS for truck_status.
-- Member-scoped reads; writes via the server/service connection. Frequently
-- updated service status — intentionally NOT wired to the compliance audit_log.
ALTER TABLE public.truck_status ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY truck_status_member_select ON public.truck_status
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
