ALTER TABLE "jwkss" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "jwkss" CASCADE;--> statement-breakpoint
ALTER TABLE "user_details" ALTER COLUMN "dob" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "user_details" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "user_details" ALTER COLUMN "updated_at" SET DATA TYPE timestamp;