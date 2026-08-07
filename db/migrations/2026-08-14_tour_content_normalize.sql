-- Tour content normalize (Fase 1):
-- queryable durationMinutes, includes/excludes, categories, pickup.

ALTER TABLE "Tour"
	ADD COLUMN IF NOT EXISTS "durationMinutes" integer,
	ADD COLUMN IF NOT EXISTS "includesJson" jsonb,
	ADD COLUMN IF NOT EXISTS "excludesJson" jsonb,
	ADD COLUMN IF NOT EXISTS "categoriesJson" jsonb,
	ADD COLUMN IF NOT EXISTS "pickupJson" jsonb;

CREATE INDEX IF NOT EXISTS "Tour_durationMinutes_idx" ON "Tour" ("durationMinutes");
CREATE INDEX IF NOT EXISTS "Tour_difficultyLevel_idx" ON "Tour" ("difficultyLevel");
