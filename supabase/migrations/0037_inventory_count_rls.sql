-- PermitKeep — Operations pillar (Tier A, step 3): RLS for inventory_count +
-- inventory_count_line. Member-scoped reads; writes via the server/service
-- connection. Operational data, NOT wired to the compliance audit_log.
ALTER TABLE public.inventory_count ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inventory_count_member_select ON public.inventory_count
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
ALTER TABLE public.inventory_count_line ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY inventory_count_line_member_select ON public.inventory_count_line
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
