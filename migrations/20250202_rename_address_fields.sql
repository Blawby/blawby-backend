-- Migration: Rename address fields to be more semantic
-- Date: 2025-02-02
-- Purpose: Rename line1 → address, line2 → apartment for clarity

-- Rename columns to be more semantic
ALTER TABLE addresses RENAME COLUMN line1 TO address;
ALTER TABLE addresses RENAME COLUMN line2 TO apartment;

-- Add comment for clarity
COMMENT ON COLUMN addresses.address IS 'Street address line 1';
COMMENT ON COLUMN addresses.apartment IS 'Apartment, suite, or unit number';
