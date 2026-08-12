ALTER TABLE "TaxFeeAssignment"
  ADD COLUMN IF NOT EXISTS "effectiveFrom" timestamptz,
  ADD COLUMN IF NOT EXISTS "effectiveTo" timestamptz;

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_effective_range_idx"
  ON "TaxFeeAssignment" ("status", "effectiveFrom", "effectiveTo");

-- Apply only after the Phase 0 duplicate audit has been remediated.
CREATE UNIQUE INDEX IF NOT EXISTS "TaxFeeAssignment_active_equivalent_unique"
  ON "TaxFeeAssignment" (
    "taxFeeDefinitionId",
    "scope",
    COALESCE("scopeId", '__provider__'),
    COALESCE("channel", '__all_channels__')
  )
  WHERE "status" = 'active';
