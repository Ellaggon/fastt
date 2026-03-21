export interface CancellationPolicyRepositoryPort {
	createCancellationPolicy(params: {
		productId: string
		name: string
		tiers: unknown[]
	}): Promise<void>

	listActiveCancellationPolicies(): Promise<
		Array<{
			id: string
			groupId: string
			version: number
			status: string
			description: string
		}>
	>

	getCancellationPolicies(productId: string): Promise<unknown[]>

	updateCancellationPolicy(params: {
		groupId: string
		name: string
		tiers: unknown[]
	}): Promise<boolean>

	toggleAssignment(params: { assignmentId: string; isActive: boolean }): Promise<void>
}
