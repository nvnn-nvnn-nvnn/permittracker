-- PermitKeep — Operations pillar (Slice 2a): RLS for ingredient.
-- Member-scoped reads; all writes via the server/service connection. Like the
-- rest of the ops pillar, ingredient is operational data and is NOT wired to
-- the compliance audit_log (no audit/immutability trigger).
ALTER TABLE public.ingredient ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ingredient_member_select ON public.ingredient
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
