-- PermitKeep — Operations pillar (Tier A, step 1): RLS for sales_item_day.
-- Member-scoped reads; writes via the server/service connection. Synced,
-- recomputable data (like sales_day) — NOT wired to the compliance audit_log.
ALTER TABLE public.sales_item_day ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sales_item_day_member_select ON public.sales_item_day
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
