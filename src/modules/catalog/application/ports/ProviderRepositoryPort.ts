export interface ProviderRepositoryPort {
	getProviderByEmail(email: string): Promise<{ id: string } | null | undefined>

	createProviderAndAssignToUser(params: {
		providerId: string
		sessionEmail: string
		provider: {
			id: string
			userEmail?: string | null
			companyName: string
			contactName?: string | null
			contactEmail: string
			phone?: string | null
			type: string
		}
	}): Promise<void>
}
