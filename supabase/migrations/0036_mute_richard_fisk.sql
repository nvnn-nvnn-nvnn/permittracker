CREATE TABLE "inventory_count" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"counted_on" date NOT NULL,
	"total_value_cents" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_count_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"count_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"counted_qty" double precision DEFAULT 0 NOT NULL,
	"unit_cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_count" ADD CONSTRAINT "inventory_count_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count" ADD CONSTRAINT "inventory_count_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_count_id_inventory_count_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."inventory_count"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count_line" ADD CONSTRAINT "inventory_count_line_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_count_account_idx" ON "inventory_count" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "inventory_count_date_idx" ON "inventory_count" USING btree ("account_id","counted_on");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_count_line_uniq" ON "inventory_count_line" USING btree ("count_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "inventory_count_line_account_idx" ON "inventory_count_line" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "inventory_count_line_count_idx" ON "inventory_count_line" USING btree ("count_id");