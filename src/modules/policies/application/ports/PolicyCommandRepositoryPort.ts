export type ActivatePolicyParams = {
	policyId: string
	effectiveFromIso: string
}

export type CreatePolicyParams = {
	previousPolicyId?: string
	description?: string
	scope: string
	scopeId: string
	category: string
	cancellationTiers?: {
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}[]
}

export type CreatePolicyVersionParams = {
	previousPolicyId: string
	description?: string
	cancellationTiers?: {
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}[]
}

export interface PolicyCommandRepositoryPort {
	activatePolicy(params: ActivatePolicyParams): Promise<{ groupId: string }>

	assignPolicyGroup(params: { groupId: string; scopeId: string }): Promise<void>
	unassignPolicyGroup(params: { groupId: string; scopeId: string }): Promise<void>

	applyPreset(params: { policyId: string; presetKey: string; description: string }): Promise<void>

	createPolicy(params: CreatePolicyParams): Promise<{ id: string; groupId: string }>
	deleteDraftPolicy(params: { policyId: string }): Promise<void>

	createPolicyVersion(
		params: CreatePolicyVersionParams
	): Promise<{ success: true; id: string; groupId: string; version: number }>
}
