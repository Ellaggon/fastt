export interface ProviderRepositoryPort {
	createProviderAndAssignToUser(params: {
		providerId: string
		sessionEmail: string
		provider: {
			id: string
			displayName: string
			legalName: string
			status?: "draft" | "active" | "archived"
		}
	}): Promise<void>
}
