CREATE TYPE "public"."activity_kind" AS ENUM('note', 'email_out', 'email_in', 'call', 'date_proposed', 'date_confirmed', 'expert_requested', 'expert_confirmed', 'expert_declined', 'status_change', 'document_added', 'hold', 'resume', 'system');--> statement-breakpoint
CREATE TYPE "public"."bureau_kind" AS ENUM('bureau', 'office');--> statement-breakpoint
CREATE TYPE "public"."candidate_date_status" AS ENUM('proposed', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('work_plan', 'agenda_draft', 'agenda_final', 'briefing_deck', 'participant_list', 'bio_packet', 'readout', 'other');--> statement-breakpoint
CREATE TYPE "public"."expert_role" AS ENUM('lead', 'briefer', 'attendee');--> statement-breakpoint
CREATE TYPE "public"."expert_status" AS ENUM('tbd', 'requested', 'confirmed', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."interpreter_mode" AS ENUM('none', 'consecutive', 'simultaneous');--> statement-breakpoint
CREATE TYPE "public"."meeting_format" AS ENUM('in_person', 'virtual', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('requested', 'developing', 'clearance', 'confirmed', 'completed', 'closed', 'on_hold', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."org_kind" AS ENUM('regulator', 'ministry', 'embassy', 'international_org', 'industry', 'academia', 'other');--> statement-breakpoint
CREATE TYPE "public"."participant_category" AS ENUM('fcc', 'other_usg', 'foreign_gov', 'industry', 'academia_ngo', 'other');--> statement-breakpoint
CREATE TYPE "public"."proposer" AS ENUM('fcc', 'visitor');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'coordinator', 'regional_lead', 'expert', 'executive', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."waiting_on" AS ENUM('none', 'visitor', 'expert', 'internal', 'och');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"meeting_id" text NOT NULL,
	"kind" "activity_kind" DEFAULT 'note' NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_id" text,
	"waiting_on" "waiting_on" DEFAULT 'none' NOT NULL,
	"waiting_on_label" text,
	"next_action" text,
	"next_action_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"diff" jsonb,
	"user_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bureaus" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "bureau_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"organization_id" text,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"cca2" text PRIMARY KEY NOT NULL,
	"cca3" text NOT NULL,
	"ccn3" text NOT NULL,
	"name" text NOT NULL,
	"region_id" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_agenda_items" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"title" text NOT NULL,
	"topic_id" text,
	"briefer_staff_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "meeting_candidate_dates" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone,
	"proposed_by" "proposer" NOT NULL,
	"status" "candidate_date_status" DEFAULT 'proposed' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_countries" (
	"meeting_id" text NOT NULL,
	"country_code" text NOT NULL,
	CONSTRAINT "meeting_countries_meeting_id_country_code_pk" PRIMARY KEY("meeting_id","country_code")
);
--> statement-breakpoint
CREATE TABLE "meeting_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"title" text NOT NULL,
	"storage_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"reusable" boolean DEFAULT false NOT NULL,
	"added_by_id" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_experts" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"bureau_code" text,
	"role" "expert_role" DEFAULT 'briefer' NOT NULL,
	"status" "expert_status" DEFAULT 'tbd' NOT NULL,
	"requested_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_participant_totals" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"category" "participant_category" NOT NULL,
	"planned" integer DEFAULT 0 NOT NULL,
	"actual" integer
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"organization_id" text,
	"contact_id" text,
	"category" "participant_category" DEFAULT 'foreign_gov' NOT NULL,
	"is_interpreter" boolean DEFAULT false NOT NULL,
	"attended" boolean
);
--> statement-breakpoint
CREATE TABLE "meeting_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"rank" integer DEFAULT 1 NOT NULL,
	"detail" text
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"status" "meeting_status" DEFAULT 'requested' NOT NULL,
	"previous_status" "meeting_status",
	"format" "meeting_format" DEFAULT 'virtual' NOT NULL,
	"region_id" text NOT NULL,
	"primary_country_code" text NOT NULL,
	"organization_id" text,
	"requestor_contact_id" text,
	"lead_user_id" text,
	"coordinator_user_id" text,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"location" text,
	"virtual_link" text,
	"purpose" text,
	"och_attending" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"hold_reason" text,
	"hold_follow_up_at" timestamp with time zone,
	"cancel_reason" text,
	"delegation_size" integer,
	"needs_av" boolean DEFAULT false NOT NULL,
	"interpreter" "interpreter_mode" DEFAULT 'none' NOT NULL,
	"accommodations" text,
	"local_contact" text,
	"background_url" text,
	"via_intermediary" text,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"kind" "org_kind" DEFAULT 'other' NOT NULL,
	"country_code" text,
	"website" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_directory" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"title" text,
	"bureau_code" text,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"staff_id" text,
	"bureau_code" text,
	"region_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blurb" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "countries" ADD CONSTRAINT "countries_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_agenda_items" ADD CONSTRAINT "meeting_agenda_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_agenda_items" ADD CONSTRAINT "meeting_agenda_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_candidate_dates" ADD CONSTRAINT "meeting_candidate_dates_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_countries" ADD CONSTRAINT "meeting_countries_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_countries" ADD CONSTRAINT "meeting_countries_country_code_countries_cca2_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("cca2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD CONSTRAINT "meeting_documents_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD CONSTRAINT "meeting_documents_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_experts" ADD CONSTRAINT "meeting_experts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_experts" ADD CONSTRAINT "meeting_experts_staff_id_staff_directory_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_experts" ADD CONSTRAINT "meeting_experts_bureau_code_bureaus_code_fk" FOREIGN KEY ("bureau_code") REFERENCES "public"."bureaus"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participant_totals" ADD CONSTRAINT "meeting_participant_totals_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_topics" ADD CONSTRAINT "meeting_topics_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_topics" ADD CONSTRAINT "meeting_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_primary_country_code_countries_cca2_fk" FOREIGN KEY ("primary_country_code") REFERENCES "public"."countries"("cca2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_requestor_contact_id_contacts_id_fk" FOREIGN KEY ("requestor_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_coordinator_user_id_users_id_fk" FOREIGN KEY ("coordinator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_country_code_countries_cca2_fk" FOREIGN KEY ("country_code") REFERENCES "public"."countries"("cca2") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_directory" ADD CONSTRAINT "staff_directory_bureau_code_bureaus_code_fk" FOREIGN KEY ("bureau_code") REFERENCES "public"."bureaus"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_id_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_staff_id_staff_directory_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_directory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_bureau_code_bureaus_code_fk" FOREIGN KEY ("bureau_code") REFERENCES "public"."bureaus"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_meeting_occurred_idx" ON "activities" USING btree ("meeting_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activities_waiting_idx" ON "activities" USING btree ("waiting_on","resolved_at");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "agenda_items_meeting_idx" ON "meeting_agenda_items" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "candidate_dates_meeting_idx" ON "meeting_candidate_dates" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_documents_meeting_idx" ON "meeting_documents" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_experts_meeting_idx" ON "meeting_experts" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_experts_staff_idx" ON "meeting_experts" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_totals_meeting_category_idx" ON "meeting_participant_totals" USING btree ("meeting_id","category");--> statement-breakpoint
CREATE INDEX "meeting_participants_meeting_idx" ON "meeting_participants" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_topics_meeting_idx" ON "meeting_topics" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_topics_topic_idx" ON "meeting_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meetings_code_idx" ON "meetings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "meetings_status_idx" ON "meetings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meetings_fy_idx" ON "meetings" USING btree ("fiscal_year");--> statement-breakpoint
CREATE INDEX "meetings_scheduled_idx" ON "meetings" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "meetings_region_idx" ON "meetings" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "meetings_country_idx" ON "meetings" USING btree ("primary_country_code");--> statement-breakpoint
CREATE INDEX "organizations_country_idx" ON "organizations" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_idx" ON "staff_directory" USING btree ("email");--> statement-breakpoint
CREATE INDEX "staff_bureau_idx" ON "staff_directory" USING btree ("bureau_code");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_slug_idx" ON "topics" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");