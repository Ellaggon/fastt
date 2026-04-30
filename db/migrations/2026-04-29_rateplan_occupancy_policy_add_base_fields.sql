-- Add canonical base fields for V2 pricing policy.
-- Additive only; no data transformation.

ALTER TABLE RatePlanOccupancyPolicy ADD COLUMN baseAmount REAL NOT NULL DEFAULT 0;
ALTER TABLE RatePlanOccupancyPolicy ADD COLUMN baseCurrency TEXT NOT NULL DEFAULT 'USD';
