CREATE TABLE "inventory_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "sales_source" DEFAULT 'square' NOT NULL,
	"business_date" date NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_used" double precision DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "inventory_usage_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "inventory_usage_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_usage_uniq" ON "inventory_usage" USING btree ("account_id","source","business_date","ingredient_id");--> statement-breakpoint
CREATE INDEX "inventory_usage_account_date_idx" ON "inventory_usage" USING btree ("account_id","business_date");--> statement-breakpoint
CREATE INDEX "inventory_usage_ingredient_idx" ON "inventory_usage" USING btree ("ingredient_id");