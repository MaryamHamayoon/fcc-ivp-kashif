CREATE TABLE "document_blobs" (
	"id" text PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD COLUMN "mime" text;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD COLUMN "size" integer;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "meeting_documents" ADD COLUMN "source_document_id" text;--> statement-breakpoint
CREATE INDEX "document_blobs_sha256_idx" ON "document_blobs" USING btree ("sha256");