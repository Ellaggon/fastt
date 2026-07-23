-- Hot-path indexes validated with EXPLAIN ANALYZE after the Supabase cutover.
-- Scope: provider settings summary, product variants, pricing summaries, tax fees.

CREATE INDEX IF NOT EXISTS "ProviderVerification_providerId_created_idx"
	ON "ProviderVerification" ("providerId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "ProviderInvitation_providerId_created_idx"
	ON "ProviderInvitation" ("providerId", "createdAt", "id");

CREATE INDEX IF NOT EXISTS "RatePlanOccupancyPolicy_ratePlan_current_idx"
	ON "RatePlanOccupancyPolicy" ("ratePlanId", "effectiveFrom", "id", "effectiveTo");

CREATE INDEX IF NOT EXISTS "EffectivePricingV2_ratePlan_occupancy_date_idx"
	ON "EffectivePricingV2" ("ratePlanId", "occupancyKey", "date", "computedAt");

CREATE INDEX IF NOT EXISTS "TaxFeeDefinition_provider_status_priority_idx"
	ON "TaxFeeDefinition" ("providerId", "status", "priority");

CREATE INDEX IF NOT EXISTS "TaxFeeDefinition_provider_code_status_idx"
	ON "TaxFeeDefinition" ("providerId", "code", "status");

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_scope_active_channel_idx"
	ON "TaxFeeAssignment" ("scope", "scopeId", "status", "channel");

CREATE INDEX IF NOT EXISTS "TaxFeeAssignment_definition_scope_active_idx"
	ON "TaxFeeAssignment" ("taxFeeDefinitionId", "scope", "scopeId", "status", "channel");
