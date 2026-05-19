CREATE TYPE "public"."digest_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "jurisdiction_digest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction" text NOT NULL,
	"period" text NOT NULL,
	"title" text NOT NULL,
	"content_markdown" text NOT NULL,
	"generated_by_model" text,
	"status" "digest_status" DEFAULT 'draft' NOT NULL,
	"edited_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jurisdiction_digest" ADD CONSTRAINT "jurisdiction_digest_edited_by_user_id_app_user_id_fk" FOREIGN KEY ("edited_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdiction_digest_uniq" ON "jurisdiction_digest" USING btree ("jurisdiction","period");