-- Preserve historical rules: each existing definition receives an immutable v1 once.
INSERT INTO "TaxFeeDefinitionVersion" (
  "id", "taxFeeDefinitionId", "version", "publicationState", "snapshotJson", "createdAt"
)
SELECT
  'tfv_' || md5(d."id" || ':1'), d."id", 1, 'published',
  jsonb_build_object(
    'code', d."code", 'name', d."name", 'kind', d."kind", 'calculationType', d."calculationType", 'value', d."value", 'currency', d."currency", 'inclusionType', d."inclusionType", 'appliesPer', d."appliesPer", 'priority', d."priority", 'jurisdiction', d."jurisdictionJson", 'effectiveFrom', d."effectiveFrom", 'effectiveTo', d."effectiveTo"
  ),
  COALESCE(d."updatedAt", d."createdAt", now())
FROM "TaxFeeDefinition" d
LEFT JOIN "TaxFeeDefinitionVersion" v ON v."taxFeeDefinitionId" = d."id"
WHERE v."id" IS NULL AND d."editingState" <> 'draft';

UPDATE "TaxFeeDefinition" d
SET "currentVersionId" = v."id", "editingState" = COALESCE(d."editingState", 'published')
FROM "TaxFeeDefinitionVersion" v
WHERE v."taxFeeDefinitionId" = d."id" AND v."version" = 1 AND d."currentVersionId" IS NULL;

-- Normalize only known casing; retain unknown and historical JSON unchanged.
UPDATE "TaxFeeDefinition"
SET "jurisdictionJson" = jsonb_set("jurisdictionJson", '{country}', to_jsonb(upper("jurisdictionJson"->>'country')), true)
WHERE "jurisdictionJson" ? 'country' AND length("jurisdictionJson"->>'country') = 2 AND "jurisdictionJson"->>'country' <> upper("jurisdictionJson"->>'country');
