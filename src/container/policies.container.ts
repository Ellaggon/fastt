import {
	RestrictionRuleEngine,
	RestrictionService,
	activatePolicy,
	applyPolicyPreset,
	assignPolicyGroup,
	buildPolicySnapshot,
	createPolicy,
	createPolicyVersion,
	deleteDraftPolicy,
	getPolicy,
	listAssignedPolicies,
	listPolicyHistory,
	resolvePolicies,
	resolvePolicyByHierarchy,
	runPolicyCompiler,
	unassignPolicyGroup,
} from "@/modules/policies/public"

import { PolicyReadRepository } from "../modules/policies/infrastructure/repositories/PolicyReadRepository"
import { PolicyCommandRepository } from "../modules/policies/infrastructure/repositories/PolicyCommandRepository"
import { EffectivePolicyRepository } from "../modules/policies/infrastructure/repositories/EffectivePolicyRepository"
import { RestrictionRepository } from "../modules/policies/infrastructure/repositories/RestrictionRepository"
import { PolicyCache } from "../modules/policies/infrastructure/cache/policy-cache"

import { createResolveHotelPoliciesQuery } from "../modules/policies/application/queries"

// ---- Infrastructure singletons ----
export const policyReadRepository = new PolicyReadRepository()
export const policyCommandRepository = new PolicyCommandRepository()
export const effectivePolicyRepository = new EffectivePolicyRepository()
export const policyCache = new PolicyCache<any>()

export const restrictionRepository = new RestrictionRepository()

// ---- Engine singletons ----
export const restrictionRuleEngine = new RestrictionRuleEngine()

// ---- Service singletons ----
export const restrictionService = new RestrictionService({
	repo: restrictionRepository,
	engine: restrictionRuleEngine,
})

// ---- Wired read queries ----
export const resolveHotelPolicies = createResolveHotelPoliciesQuery({
	repo: effectivePolicyRepository,
})

// ---- Wired use-cases ----
export async function resolvePoliciesUseCase(params: Parameters<typeof resolvePolicies>[1]) {
	return resolvePolicies({ queryRepo: policyReadRepository, cache: policyCache }, params)
}

export async function resolvePolicyByHierarchyUseCase(params: {
	category: string
	entityType: string
	entityId: string
}) {
	return resolvePolicyByHierarchy({ queryRepo: policyReadRepository }, params)
}

export async function buildPolicySnapshotUseCase(params: { entityType: string; entityId: string }) {
	return buildPolicySnapshot(
		{ effectivePolicyRepo: effectivePolicyRepository, queryRepo: policyReadRepository },
		params
	)
}

export async function runPolicyCompilerUseCase(entityType: string, entityId: string) {
	return runPolicyCompiler(
		{
			effectivePolicyRepo: effectivePolicyRepository,
			queryRepo: policyReadRepository,
			cache: policyCache,
		},
		{ entityType, entityId }
	)
}

export async function getPolicyUseCase(policyId: string) {
	return getPolicy({ queryRepo: policyReadRepository }, { policyId })
}

export async function listAssignedPoliciesUseCase(scopeId: string, category?: string | null) {
	return listAssignedPolicies({ queryRepo: policyReadRepository }, { scopeId, category })
}

export async function assignPolicyGroupUseCase(groupId: string, scopeId: string) {
	return assignPolicyGroup({ commandRepo: policyCommandRepository }, { groupId, scopeId })
}

export async function unassignPolicyGroupUseCase(groupId: string, scopeId: string) {
	return unassignPolicyGroup({ commandRepo: policyCommandRepository }, { groupId, scopeId })
}

export async function activatePolicyUseCase(policyId: string, effectiveFrom?: string) {
	return activatePolicy(
		{
			commandRepo: policyCommandRepository,
			queryRepo: policyReadRepository,
			runPolicyCompiler: runPolicyCompilerUseCase,
		},
		{ policyId, effectiveFrom }
	)
}

export async function createPolicyUseCase(params: Parameters<typeof createPolicy>[1]) {
	return createPolicy({ commandRepo: policyCommandRepository }, params)
}

export async function deleteDraftPolicyUseCase(policyId: string) {
	return deleteDraftPolicy({ commandRepo: policyCommandRepository }, { policyId })
}

export async function createPolicyVersionUseCase(
	params: Parameters<typeof createPolicyVersion>[1]
) {
	return createPolicyVersion({ commandRepo: policyCommandRepository }, params)
}

export async function applyPolicyPresetUseCase(policyId: string, presetKey: string) {
	return applyPolicyPreset(
		{ commandRepo: policyCommandRepository, queryRepo: policyReadRepository },
		{ policyId, presetKey }
	)
}

export async function listPolicyHistoryUseCase(groupId: string) {
	return listPolicyHistory({ queryRepo: policyReadRepository }, { groupId })
}
