CREATE TYPE "public"."file_status" AS ENUM('uploading', 'uploaded', 'extracting', 'extracted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ocr_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."audit_entity" ADD VALUE 'file_attachment';--> statement-breakpoint
CREATE TABLE "extraction_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"file_id" uuid,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"document_type" text,
	"subtype" text,
	"jurisdiction" text,
	"identifier_number" text,
	"issue_date" date,
	"expiration_date" date,
	"renewal_fee_amount_cents" integer,
	"fee_due_date" date,
	"holder_name" text,
	"field_confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"applied_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"compliance_item_id" uuid,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"status" "file_status" DEFAULT 'uploading' NOT NULL,
	"extracted_text" text,
	"ocr_confidence" "ocr_confidence",
	"needs_manual_review" boolean DEFAULT false NOT NULL,
	"extraction_error" text,
	"created_by_user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_cost" ADD CONSTRAINT "extraction_cost_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_cost" ADD CONSTRAINT "extraction_cost_file_id_file_attachment_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposal" ADD CONSTRAINT "extraction_proposal_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposal" ADD CONSTRAINT "extraction_proposal_file_id_file_attachment_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_attachment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposal" ADD CONSTRAINT "extraction_proposal_applied_by_user_id_app_user_id_fk" FOREIGN KEY ("applied_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_compliance_item_id_compliance_item_id_fk" FOREIGN KEY ("compliance_item_id") REFERENCES "public"."compliance_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_attachment" ADD CONSTRAINT "file_attachment_created_by_user_id_app_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_cost_account_idx" ON "extraction_cost" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "extraction_proposal_account_idx" ON "extraction_proposal" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "extraction_proposal_file_idx" ON "extraction_proposal" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_attachment_account_idx" ON "file_attachment" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "file_attachment_item_idx" ON "file_attachment" USING btree ("compliance_item_id");