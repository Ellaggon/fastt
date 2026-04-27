-- Phase 1 (expand-only): extend SearchUnitView with full sellability primitives.
-- Non-destructive additive migration for backward compatibility.

ALTER TABLE SearchUnitView ADD COLUMN hasAvailability INTEGER NOT NULL DEFAULT 0;
ALTER TABLE SearchUnitView ADD COLUMN hasPrice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE SearchUnitView ADD COLUMN stopSell INTEGER NOT NULL DEFAULT 1;
ALTER TABLE SearchUnitView ADD COLUMN cta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE SearchUnitView ADD COLUMN ctd INTEGER NOT NULL DEFAULT 0;

-- minStay/primaryBlocker already exist in some environments; keep optional compatibility.
