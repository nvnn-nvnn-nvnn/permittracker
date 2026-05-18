CREATE TYPE "public"."plan_status" AS ENUM('none', 'active', 'trialing', 'past_due', 'canceled');--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "plan_status" "plan_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "plan_interval" text;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "concierge_purchased_at" timestamp with time zone;