-- Fase 4.4.7: Inventory is physical-only.
-- These columns remain in the schema as deprecated compatibility fields, but
-- they must no longer preserve commercial stop-sell state. Canonical
-- sellability lives in Restriction / EffectiveRestriction.

UPDATE DailyInventory
SET stopSell = 0
WHERE stopSell <> 0;

UPDATE EffectiveAvailability
SET
	stopSell = 0,
	isSellable = CASE WHEN availableUnits > 0 THEN 1 ELSE 0 END
WHERE stopSell <> 0
	OR isSellable <> CASE WHEN availableUnits > 0 THEN 1 ELSE 0 END;
