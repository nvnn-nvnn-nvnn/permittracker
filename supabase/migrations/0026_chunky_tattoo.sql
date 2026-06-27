CREATE TABLE "ingredient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"on_hand_qty" double precision DEFAULT 0 NOT NULL,
	"par_level" double precision,
	"reorder_to_qty" double precision,
	"supplier_name" text,
	"notes" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_account_idx" ON "ingredient" USING btree ("account_id");