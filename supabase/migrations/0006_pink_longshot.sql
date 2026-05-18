CREATE TYPE "public"."dispatch_status" AS ENUM('scheduled', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."reminder_channel" AS ENUM('email', 'sms', 'voice');--> statement-breakpoint
CREATE TYPE "public"."reminder_kind" AS ENUM('expiry', 'fee');--> statement-breakpoint
CREATE TABLE "reminder_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"compliance_item_id" uuid NOT NULL,
	"channel" "reminder_channel" DEFAULT 'email' NOT NULL,
	"kind" "reminder_kind" DEFAULT 'expiry' NOT NULL,
	"offset_days" integer NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "dispatch_status" DEFAULT 'scheduled' NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD CONSTRAINT "reminder_dispatch_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_dispatch" ADD CONSTRAINT "reminder_dispatch_compliance_item_id_compliance_item_id_fk" FOREIGN KEY ("compliance_item_id") REFERENCES "public"."compliance_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminder_dispatch_account_idx" ON "reminder_dispatch" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "reminder_dispatch_item_idx" ON "reminder_dispatch" USING btree ("compliance_item_id");--> statement-breakpoint
CREATE INDEX "reminder_dispatch_due_idx" ON "reminder_dispatch" USING btree ("status","scheduled_for");