CREATE TYPE "public"."reinspection_status" AS ENUM('not_required', 'pending', 'scheduled', 'cleared');--> statement-breakpoint
CREATE TABLE "truck_modification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"truck_id" uuid NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"changed_on" date NOT NULL,
	"reinspection_status" "reinspection_status" DEFAULT 'not_required' NOT NULL,
	"reported_to_health_dept" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "truck_modification" ADD CONSTRAINT "truck_modification_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_modification" ADD CONSTRAINT "truck_modification_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_modification" ADD CONSTRAINT "truck_modification_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "truck_modification_account_idx" ON "truck_modification" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "truck_modification_truck_idx" ON "truck_modification" USING btree ("truck_id");