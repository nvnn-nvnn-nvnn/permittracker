-- PermitKeep — Operations pillar (Slice 3): RLS for expense.
-- Member-scoped reads; all writes via the server/service connection.
-- Operational data, NOT wired to the compliance audit_log.
ALTER TABLE public.expense ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY expense_member_select ON public.expense
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
