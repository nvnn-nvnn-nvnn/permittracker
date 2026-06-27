-- PermitKeep — Compliance pillar (Tier A, step 6): RLS for truck_modification.
-- Member-scoped reads; writes via the server/service connection. It is itself
-- an append-style change log; not wired to the audit_log trigger.
ALTER TABLE public.truck_modification ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY truck_modification_member_select ON public.truck_modification
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
