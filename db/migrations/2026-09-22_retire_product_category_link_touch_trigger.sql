-- ProductCategory and ProductCategoryLink are immutable taxonomy/link records
-- with createdAt only. Retire historical touch triggers that target a removed
-- updatedAt column and would fail on UPDATE.
DROP TRIGGER IF EXISTS "trg_ProductCategory_touch_updatedAt" ON "ProductCategory";
DROP TRIGGER IF EXISTS "trg_ProductCategoryLink_touch_updatedAt" ON "ProductCategoryLink";
