CREATE TYPE "public"."audit_action" AS ENUM('insert', 'update', 'archive');--> statement-breakpoint
CREATE TYPE "public"."audit_entity" AS ENUM('truck', 'compliance_item');--> statement-breakpoint
CREATE TYPE "public"."holder_type" AS ENUM('truck', 'person', 'business');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('active', 'pending', 'expired');--> statement-breakpoint
CREATE TYPE "public"."item_type" AS ENUM('permit', 'inspection', 'certification', 'coi', 'vehicle');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" "audit_entity" NOT NULL,
	"entity_id" uuid NOT NULL,
	"prior_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"item_type" "item_type" NOT NULL,
	"subtype" text,
	"jurisdiction" text,
	"identifier" text,
	"issue_date" date,
	"expiration_date" date,
	"fee_amount_cents" integer,
	"fee_due_date" date,
	"status" "item_status" DEFAULT 'active' NOT NULL,
	"holder_type" "holder_type" DEFAULT 'truck' NOT NULL,
	"holder_truck_id" uuid,
	"holder_name" text,
	"parent_item_id" uuid,
	"notes" text,
	"reminder_days_before" integer[] DEFAULT '{}'::int[] NOT NULL,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "truck" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"plate_or_vin" text,
	"jurisdiction" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_holder_truck_id_truck_id_fk" FOREIGN KEY ("holder_truck_id") REFERENCES "public"."truck"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_parent_item_id_compliance_item_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."compliance_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_item" ADD CONSTRAINT "compliance_item_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_account_idx" ON "audit_log" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "compliance_item_account_idx" ON "compliance_item" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "compliance_item_truck_idx" ON "compliance_item" USING btree ("holder_truck_id");--> statement-breakpoint
CREATE INDEX "compliance_item_expiration_idx" ON "compliance_item" USING btree ("expiration_date");--> statement-breakpoint
CREATE INDEX "truck_account_idx" ON "truck" USING btree ("account_id");