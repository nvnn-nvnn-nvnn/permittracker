ALTER TABLE "ingredient" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_count" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN "truck_id" uuid;--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_count" ADD CONSTRAINT "inventory_count_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_usage" ADD CONSTRAINT "inventory_usage_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_truck_id_truck_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."truck"("id") ON DELETE cascade ON UPDATE no action;