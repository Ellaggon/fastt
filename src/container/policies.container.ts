import { RestrictionRuleEngine, RestrictionService } from "@/modules/policies/public"

import { RestrictionRepository } from "../modules/policies/infrastructure/repositories/RestrictionRepository"

// Container wiring for restrictions only.
//
// CAPA 6 policies use their own isolated containers (resolution + write path).
// Legacy policy compiler/cache/resolvers have been removed from this container to prevent
// multiple sources of truth.
export const restrictionRepository = new RestrictionRepository()
export const restrictionRuleEngine = new RestrictionRuleEngine()
export const restrictionService = new RestrictionService({
	repo: restrictionRepository,
	engine: restrictionRuleEngine,
})
