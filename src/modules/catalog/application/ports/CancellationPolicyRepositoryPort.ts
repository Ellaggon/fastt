export interface CancellationPolicyRepositoryPort {
	createCancellationPolicy(params: {
		productId: string
		name: string
		tiers: unknown[]
	}): Promise<void>

	getCancellationPolicies(productId: string): Promise<unknown[]>

	updateCancellationPolicy(params: {
		groupId: string
		name: string
		tiers: unknown[]
	}): Promise<boolean>

	toggleAssignment(params: { assignmentId: string; isActive: boolean }): Promise<void>
}
