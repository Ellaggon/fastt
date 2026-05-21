-- Fase 4.4.9 contract cleanup:
-- sellability no longer belongs to Inventory, EffectiveAvailability, or SearchUnitView
-- flags. Restrictions/EffectiveRestriction own commercial sellability.

DROP INDEX IF EXISTS SearchUnitView_product_date_occ_sellable_idx;
DROP INDEX IF EXISTS SearchUnitView_sellable_price_idx;

ALTER TABLE DailyInventory DROP COLUMN stopSell;

ALTER TABLE EffectiveAvailability DROP COLUMN stopSell;
ALTER TABLE EffectiveAvailability DROP COLUMN isSellable;

ALTER TABLE SearchUnitView DROP COLUMN isSellable;
ALTER TABLE SearchUnitView DROP COLUMN stopSell;

CREATE INDEX IF NOT EXISTS SearchUnitView_product_date_occ_idx
ON SearchUnitView (productId, date, occupancyKey);

CREATE INDEX IF NOT EXISTS SearchUnitView_blocker_price_idx
ON SearchUnitView (primaryBlocker, pricePerNight);
