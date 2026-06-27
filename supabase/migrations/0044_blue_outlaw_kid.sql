DROP INDEX "sales_day_account_source_date_uniq";--> statement-breakpoint
DROP INDEX "square_connection_account_uniq";--> statement-breakpoint
DROP INDEX "sales_item_day_uniq";--> statement-breakpoint
ALTER TABLE "expense" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_day" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_item_day" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "square_connection" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_day" ADD CONSTRAINT "sales_day_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_item_day" ADD CONSTRAINT "sales_item_day_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "square_connection" ADD CONSTRAINT "square_connection_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_day_account_truck_source_date_uniq" ON "sales_day" USING btree ("account_id","truck_id","source","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "square_connection_truck_uniq" ON "square_connection" USING btree ("truck_id");--> statement-breakpoint
CREATE INDEX "square_connection_account_idx" ON "square_connection" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_item_day_uniq" ON "sales_item_day" USING btree ("account_id","truck_id","source","business_date","item_name");