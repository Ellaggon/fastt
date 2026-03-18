import { db, Provider, eq } from "astro:db"

export class ProviderRepository {
	async getProviderByEmail(email: string) {
		if (!email) return null
		return await db
			.select({ id: Provider.id })
			.from(Provider)
			.where(eq(Provider.userEmail, email))
			.get()
	}
}
