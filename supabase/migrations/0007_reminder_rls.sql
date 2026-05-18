-- PermitKeep — Phase 4: RLS for reminder_dispatch.
-- Same model as every other tenant table: member-scoped reads, all writes
-- via the server/service connection. Dispatches are hard-deletable and
-- recomputed by the app, so (unlike audit_log) no immutability trigger.
ALTER TABLE public.reminder_dispatch ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reminder_dispatch_member_select ON public.reminder_dispatch
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
