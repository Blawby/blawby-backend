-- Rename customer_details table to user_details
ALTER TABLE "customer_details" RENAME TO "user_details";

-- Rename the foreign key constraint
ALTER TABLE "user_details" RENAME CONSTRAINT "customer_details_user_id_users_id_fk" TO "user_details_user_id_users_id_fk";

-- Rename indexes
ALTER INDEX "customer_details_user_id_idx" RENAME TO "user_details_user_id_idx";
ALTER INDEX "customer_details_stripe_customer_id_idx" RENAME TO "user_details_stripe_customer_id_idx";
ALTER INDEX "customer_details_phone_idx" RENAME TO "user_details_phone_idx";
