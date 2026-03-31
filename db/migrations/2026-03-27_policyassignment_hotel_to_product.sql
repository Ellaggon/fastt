-- CAPA 6 / STEP 3: Remove "hotel" as a policy scope.
--
-- Canonical scopes are:
--   global | product | variant | rate_plan
--
-- Mapping rationale:
-- In this schema, `Hotel` is a 1:1 subtype extension of `Product` where:
--   Hotel.productId is the PK and FK to Product.id
-- Therefore, any "hotel-scoped" PolicyAssignment.scopeId MUST already be a Product.id.
-- We migrate:
--   scope = 'hotel'  => scope = 'product'
--   scopeId stays the same (productId).
--
-- Safe to run multiple times (idempotent).

-- Pre-check: how many "hotel" assignments exist?
SELECT COUNT(*) AS hotel_scope_count
FROM PolicyAssignment
WHERE scope = 'hotel';

-- Sanity: any hotel assignments whose scopeId is NOT a Product.id?
SELECT COUNT(*) AS hotel_scope_orphans
FROM PolicyAssignment pa
LEFT JOIN Product p ON p.id = pa.scopeId
WHERE pa.scope = 'hotel'
  AND p.id IS NULL;

-- Migrate: update hotel => product
UPDATE PolicyAssignment
SET scope = 'product'
WHERE scope = 'hotel';

-- Post-check: must be 0
SELECT COUNT(*) AS hotel_scope_count_after
FROM PolicyAssignment
WHERE scope = 'hotel';

