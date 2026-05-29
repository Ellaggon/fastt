-- Drop Hotel location mirrors after ProductLocation backfill.
-- Canonical accommodation location lives in ProductLocation.

ALTER TABLE "Hotel" DROP COLUMN "address";
ALTER TABLE "Hotel" DROP COLUMN "latitude";
ALTER TABLE "Hotel" DROP COLUMN "longitude";
