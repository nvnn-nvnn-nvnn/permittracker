ALTER TYPE "public"."audit_entity" ADD VALUE 'commissary';--> statement-breakpoint
CREATE TABLE "commissary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"permit_expiration" date,
	"contract_expiration" date,
	"notes" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "truck" ADD COLUMN "commissary_id" uuid;--> statement-breakpoint
ALTER TABLE "commissary" ADD CONSTRAINT "commissary_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissary" ADD CONSTRAINT "commissary_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commissary_account_idx" ON "commissary" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "truck" ADD CONSTRAINT "truck_commissary_id_commissary_id_fk" FOREIGN KEY ("commissary_id") REFERENCES "public"."commissary"("id") ON DELETE set null ON UPDATE no action;