import { db, Provider, User, eq } from "astro:db"
import type { ProviderRepositoryPort } from "../../application/ports/ProviderRepositoryPort"

export class ProviderRepository implements ProviderRepositoryPort {
	async getProviderByEmail(email: string) {
		if (!email) return null
		return await db
			.select({ id: Provider.id })
			.from(Provider)
			.where(eq(Provider.userEmail, email))
			.get()
	}

	async createProviderAndAssignToUser(params: {
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
	}): Promise<void> {
		await db.insert(Provider).values(params.provider)
		await db
			.update(User)
			.set({ providerId: params.providerId })
			.where(eq(User.email, params.sessionEmail))
	}
}
