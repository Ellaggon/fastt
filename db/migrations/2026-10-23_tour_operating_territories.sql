ALTER TABLE "TourComplianceContext" ADD COLUMN IF NOT EXISTS "jurisdictionCodes" jsonb;
UPDATE "TourComplianceContext"
SET "jurisdictionCodes" = jsonb_build_array("jurisdictionCode")
WHERE "jurisdictionCodes" IS NULL AND "jurisdictionCode" IN ('BO-BN', 'BO-CH', 'BO-CB', 'BO-LP', 'BO-OR', 'BO-PN', 'BO-PT', 'BO-SC', 'BO-TJ');
ALTER TABLE "TourComplianceContext" ADD CONSTRAINT "TourComplianceContext_territories_check"
CHECK ("jurisdictionCodes" IS NULL OR (
 jsonb_typeof("jurisdictionCodes") = 'array'
 AND jsonb_array_length("jurisdictionCodes") BETWEEN 1 AND 9
 AND "jurisdictionCodes" <@ '["BO-BN","BO-CH","BO-CB","BO-LP","BO-OR","BO-PN","BO-PT","BO-SC","BO-TJ"]'::jsonb
));
