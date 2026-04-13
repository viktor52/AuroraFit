-- Remove optional image URL from Life Fitness machines (if it was ever added).
-- IF EXISTS avoids failure when the column was never created or was already dropped.
ALTER TABLE "LifeFitnessMachine" DROP COLUMN IF EXISTS "imageUrl";
