-- Historical integration suites used deterministic product ids but wrote them as
-- production before data provenance existed. They must never surface publicly.
UPDATE "Product"
SET "dataClass" = 'fixture'
WHERE "dataClass" = 'production'
  AND (
    "id" LIKE 'prod_disc_%'
    OR "id" LIKE 'prod_marketplace_certification_%'
    OR "id" LIKE 'qa_financial_%'
  );

UPDATE "ProductContent" content
SET "dataClass" = product."dataClass"
FROM "Product" product
WHERE product."id" = content."productId"
  AND product."dataClass" = 'fixture'
  AND content."dataClass" IS DISTINCT FROM 'fixture';
