// New canonical policy resolver wiring (isolated).
// IMPORTANT: This container is NOT exported from src/container/index.ts yet.

import {
	resolveEffectivePoliciesByContract,
	type ScopeContext,
} from "@/modules/policies/application/use-cases/resolve-effective-policies"
import { PolicyResolutionRepository } from "@/modules/policies/infrastructure/repositories/PolicyResolutionRepository"
import type { LegacyPolicyResolutionResult } from "@/modules/policies/application/adapters/policyResolutionAdapter"
import type { PolicyResolutionDTO } from "@/modules/policies/application/dto/PolicyResolutionDTO"

export const policyResolutionRepository = new PolicyResolutionRepository()

export async function resolveEffectivePoliciesUseCase(
	params: ScopeContext
): Promise<PolicyResolutionDTO | LegacyPolicyResolutionResult> {
	return resolveEffectivePoliciesByContract({ repo: policyResolutionRepository }, params)
}
