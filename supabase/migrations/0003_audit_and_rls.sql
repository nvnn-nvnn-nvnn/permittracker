-- PermitKeep — Phase 2: append-only audit log + RLS for new tables.
--
-- WHY a DB trigger (not app code): the brief says the app must be physically
-- unable to forge or erase history. App-level logging can be bypassed by a
-- bug or a malicious path; a trigger fires for EVERY write including the
-- service role, and a BEFORE UPDATE/DELETE guard makes the log immutable even
-- to us.

-- Actor is passed per-transaction via a custom GUC the app sets with
-- set_config('permitkeep.actor_id', <uuid>, true). `true` = transaction-local.
-- The trigger reads it; if absent the row is attributed to NULL (system).
CREATE OR REPLACE FUNCTION public.permitkeep_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_action public.audit_action;
  v_entity public.audit_entity;
BEGIN
  BEGIN
    v_actor := nullif(current_setting('permitkeep.actor_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_actor := NULL;
  END;

  v_entity := TG_ARGV[0]::public.audit_entity;

  IF TG_OP = 'INSERT' THEN
    v_action := 'insert';
    INSERT INTO public.audit_log
      (account_id, actor_user_id, action, entity_type, entity_id,
       prior_value, new_value)
    VALUES
      (NEW.account_id, v_actor, v_action, v_entity, NEW.id,
       NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
      v_action := 'archive';
    ELSE
      v_action := 'update';
    END IF;
    INSERT INTO public.audit_log
      (account_id, actor_user_id, action, entity_type, entity_id,
       prior_value, new_value)
    VALUES
      (NEW.account_id, v_actor, v_action, v_entity, NEW.id,
       to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Immutability guard: reject ANY update/delete on audit_log, for ALL roles.
CREATE OR REPLACE FUNCTION public.permitkeep_audit_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER truck_audit
  AFTER INSERT OR UPDATE ON public.truck
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit('truck');
--> statement-breakpoint
CREATE TRIGGER compliance_item_audit
  AFTER INSERT OR UPDATE ON public.compliance_item
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit('compliance_item');
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit_block();
--> statement-breakpoint
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit_block();
--> statement-breakpoint
-- Defense in depth: also revoke the privileges outright.
REVOKE UPDATE, DELETE ON public.audit_log FROM PUBLIC;
--> statement-breakpoint
-- RLS for the new tables (same model as Phase 1: member-scoped reads only,
-- all writes go through the server/service connection via tRPC).
ALTER TABLE public.truck            ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.compliance_item  ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.audit_log        ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY truck_member_select ON public.truck
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
CREATE POLICY compliance_item_member_select ON public.compliance_item
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
--> statement-breakpoint
CREATE POLICY audit_log_member_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
