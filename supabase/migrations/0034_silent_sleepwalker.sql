CREATE TABLE "sales_item_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "sales_source" DEFAULT 'square' NOT NULL,
	"business_date" date NOT NULL,
	"item_name" text NOT NULL,
	"square_item_id" text,
	"qty_sold" double precision DEFAULT 0 NOT NULL,
	"gross_sales_cents" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_item_day" ADD CONSTRAINT "sales_item_day_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_item_day_uniq" ON "sales_item_day" USING btree ("account_id","source","business_date","item_name");--> statement-breakpoint
CREATE INDEX "sales_item_day_account_date_idx" ON "sales_item_day" USING btree ("account_id","business_date");