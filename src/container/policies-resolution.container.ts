// New canonical policy resolver wiring (isolated).
// IMPORTANT: This container is NOT exported from src/container/index.ts yet.

import { resolveEffectivePolicies } from "@/modules/policies/application/use-cases/resolve-effective-policies"
import { PolicyResolutionRepository } from "@/modules/policies/infrastructure/repositories/PolicyResolutionRepository"

export const policyResolutionRepository = new PolicyResolutionRepository()

export async function resolveEffectivePoliciesUseCase(params: {
	productId: string
	variantId?: string
	ratePlanId?: string
	channel?: string
}) {
	return resolveEffectivePolicies({ repo: policyResolutionRepository }, params)
}
