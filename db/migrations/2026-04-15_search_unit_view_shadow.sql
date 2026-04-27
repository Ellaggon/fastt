CREATE TABLE IF NOT EXISTS SearchUnitView (
  id TEXT PRIMARY KEY NOT NULL,
  variantId TEXT NOT NULL REFERENCES Variant(id),
  productId TEXT NOT NULL REFERENCES Product(id),
  ratePlanId TEXT NOT NULL,
  date TEXT NOT NULL,
  occupancyKey TEXT NOT NULL,
  totalGuests INTEGER NOT NULL,
  isSellable INTEGER NOT NULL DEFAULT 0,
  isAvailable INTEGER NOT NULL DEFAULT 0,
  availableUnits INTEGER NOT NULL DEFAULT 0,
  pricePerNight REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  primaryBlocker TEXT,
  minStay INTEGER,
  computedAt NUMERIC NOT NULL,
  sourceVersion TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS SearchUnitView_variant_rateplan_date_occ_idx
ON SearchUnitView (variantId, ratePlanId, date, occupancyKey);

CREATE INDEX IF NOT EXISTS SearchUnitView_product_date_occ_sellable_idx
ON SearchUnitView (productId, date, occupancyKey, isSellable);

CREATE INDEX IF NOT EXISTS SearchUnitView_variant_date_idx
ON SearchUnitView (variantId, date);

CREATE INDEX IF NOT EXISTS SearchUnitView_sellable_price_idx
ON SearchUnitView (isSellable, pricePerNight);
