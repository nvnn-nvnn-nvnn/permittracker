-- PermitKeep — Row Level Security (account isolation).
--
-- The app server uses the direct/service connection which BYPASSES RLS, and
-- additionally filters every query by account_id (defense in depth). These
-- policies protect any anon/authenticated-key access (e.g. browser Supabase
-- client) so a tenant can never read another tenant's rows.

-- Membership check as SECURITY DEFINER to avoid recursive RLS evaluation when
-- a policy on `membership` needs to consult `membership`.
CREATE OR REPLACE FUNCTION public.permitkeep_is_member(target_account uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.membership m
    WHERE m.account_id = target_account
      AND m.user_id = auth.uid()
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.permitkeep_is_member(uuid) FROM public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.permitkeep_is_member(uuid) TO authenticated;
--> statement-breakpoint
-- Enable RLS. With RLS on and no permissive policy, non-service roles are
-- denied by default; service_role bypasses RLS entirely.
ALTER TABLE public.app_user   ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.account    ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- app_user: a user may read/update only their own identity row.
CREATE POLICY app_user_self_select ON public.app_user
  FOR SELECT TO authenticated
  USING (id = auth.uid());
--> statement-breakpoint
CREATE POLICY app_user_self_update ON public.app_user
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
--> statement-breakpoint
-- account: readable by any member of that account.
CREATE POLICY account_member_select ON public.account
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(id));
--> statement-breakpoint
-- membership: a user sees membership rows for accounts they belong to.
CREATE POLICY membership_member_select ON public.membership
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
-- NOTE: No INSERT/UPDATE/DELETE policies for non-service roles by design.
-- All writes go through tRPC on the server (service connection).
