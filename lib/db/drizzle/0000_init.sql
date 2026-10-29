CREATE TYPE "public"."event_slot" AS ENUM('morning', 'afternoon', 'midnight');--> statement-breakpoint
CREATE TABLE "admin_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"attendance_date" date NOT NULL,
	"exp_granted" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"slot" "event_slot" NOT NULL,
	"event_date" date NOT NULL,
	"submitted_phrase" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"review_note" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slot" "event_slot" NOT NULL,
	"accepted_phrase" text NOT NULL,
	"event_time" time NOT NULL,
	"reward_exp" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_number" text NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"open_chat_nickname" text,
	"link_status" text DEFAULT 'pending' NOT NULL,
	"kakao_user_key" text,
	"kakao_link_code" text,
	"kakao_link_code_expires_at" timestamp with time zone,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"total_exp" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experience_entries" ADD CONSTRAINT "experience_entries_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_logs_created_at_idx" ON "admin_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_member_date_unique" ON "attendance" USING btree ("member_id","attendance_date");--> statement-breakpoint
CREATE UNIQUE INDEX "event_claims_member_event_date_unique" ON "event_claims" USING btree ("member_id","event_id","event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slot_unique" ON "events" USING btree ("slot");--> statement-breakpoint
CREATE UNIQUE INDEX "experience_member_source_unique" ON "experience_entries" USING btree ("member_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_member_number_unique" ON "members" USING btree ("member_number");--> statement-breakpoint
CREATE UNIQUE INDEX "members_clerk_user_id_unique" ON "members" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_open_chat_nickname_unique" ON "members" USING btree (lower("open_chat_nickname")) WHERE "members"."open_chat_nickname" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "members_kakao_user_key_unique" ON "members" USING btree ("kakao_user_key") WHERE "members"."kakao_user_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "members_kakao_link_code_unique" ON "members" USING btree ("kakao_link_code") WHERE "members"."kakao_link_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "members_level_exp_rank_idx" ON "members" USING btree ("level","exp");