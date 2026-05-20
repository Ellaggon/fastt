-- Expand-only ARI hardening: SearchUnitView keeps search-facing sellability
-- primitives materialized from EffectiveRestriction. Availability remains physical.
ALTER TABLE SearchUnitView ADD COLUMN maxStay INTEGER;
ALTER TABLE SearchUnitView ADD COLUMN minLeadTime INTEGER;
ALTER TABLE SearchUnitView ADD COLUMN maxLeadTime INTEGER;
