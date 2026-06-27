CREATE TYPE "public"."service_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "truck_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"truck_id" uuid NOT NULL,
	"service_status" "service_status" DEFAULT 'closed' NOT NULL,
	"current_location" text,
	"service_window" text,
	"status_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "truck_status" ADD CONSTRAINT "truck_status_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "truck_status" ADD CONSTRAINT "truck_status_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "truck_status_truck_uniq" ON "truck_status" USING btree ("truck_id");