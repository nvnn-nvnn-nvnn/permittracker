-- PermitKeep — Operations pillar (Slice 2c): RLS for purchase_order +
-- purchase_order_item. Member-scoped reads; all writes via the server/service
-- connection. Operational data, NOT wired to the compliance audit_log.
ALTER TABLE public.purchase_order ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY purchase_order_member_select ON public.purchase_order
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
ALTER TABLE public.purchase_order_item ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY purchase_order_item_member_select ON public.purchase_order_item
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
