-- PermitKeep — Operations pillar (Slice 2b): RLS for recipe + recipe_ingredient.
-- Member-scoped reads; all writes via the server/service connection. Both are
-- operational data and are NOT wired to the compliance audit_log. recipe_
-- ingredient is a hard-deletable join replaced on each recipe save.
ALTER TABLE public.recipe ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY recipe_member_select ON public.recipe
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
ALTER TABLE public.recipe_ingredient ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY recipe_ingredient_member_select ON public.recipe_ingredient
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
