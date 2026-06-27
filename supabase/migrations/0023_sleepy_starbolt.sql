CREATE TYPE "public"."sales_source" AS ENUM('square', 'manual');--> statement-breakpoint
CREATE TABLE "sales_day" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"source" "sales_source" DEFAULT 'square' NOT NULL,
	"business_date" date NOT NULL,
	"gross_sales_cents" integer DEFAULT 0 NOT NULL,
	"refunds_cents" integer DEFAULT 0 NOT NULL,
	"net_sales_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tips_cents" integer DEFAULT 0 NOT NULL,
	"discounts_cents" integer DEFAULT 0 NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "square_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connected" boolean DEFAULT true NOT NULL,
	"merchant_id" text,
	"location_id" text,
	"location_name" text,
	"environment" text,
	"last_synced_at" timestamp with time zone,
	"connected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_day" ADD CONSTRAINT "sales_day_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_connection" ADD CONSTRAINT "square_connection_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_connection" ADD CONSTRAINT "square_connection_connected_by_user_id_app_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_day_account_source_date_uniq" ON "sales_day" USING btree ("account_id","source","business_date");--> statement-breakpoint
CREATE INDEX "sales_day_account_date_idx" ON "sales_day" USING btree ("account_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "square_connection_account_uniq" ON "square_connection" USING btree ("account_id");