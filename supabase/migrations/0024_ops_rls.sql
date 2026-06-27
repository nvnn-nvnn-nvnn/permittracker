-- PermitKeep — Operations pillar (Slice 1): RLS for square_connection + sales_day.
-- Same model as every other tenant table: member-scoped reads, all writes via
-- the server/service connection. sales_day is synced, recomputable data (like
-- reminder_dispatch) and square_connection is per-account config — so neither
-- carries an audit/immutability trigger.
ALTER TABLE public.square_connection ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY square_connection_member_select ON public.square_connection
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
ALTER TABLE public.sales_day ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sales_day_member_select ON public.sales_day
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
