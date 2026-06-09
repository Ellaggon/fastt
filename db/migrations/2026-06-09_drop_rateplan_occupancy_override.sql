-- RatePlan occupancy overrides are intentionally resolved through PriceRule.
-- PriceRule already supports occupancyKey, dateRangeJson, priority and override type.
DROP TABLE IF EXISTS "RatePlanOccupancyOverride";
