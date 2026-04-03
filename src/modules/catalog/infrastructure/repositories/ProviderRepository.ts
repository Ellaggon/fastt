import { and, db, Provider, ProviderUser, User, eq } from "astro:db"
import type { ProviderRepositoryPort } from "../../application/ports/ProviderRepositoryPort"

export class ProviderRepository implements ProviderRepositoryPort {
	async getProviderByUserId(userId: string) {
		if (!userId) return null
		if (!(User as any)?.id || !(ProviderUser as any)?.providerId || !(ProviderUser as any)?.userId)
			return null
		try {
			const link = await db
				.select({ providerId: ProviderUser.providerId })
				.from(ProviderUser)
				.where(eq(ProviderUser.userId, userId))
				.get()
			if (!link?.providerId) return null
			return await db
				.select({ id: Provider.id })
				.from(Provider)
				.where(eq(Provider.id, link.providerId))
				.get()
		} catch {
			return null
		}
	}

	async createProviderAndAssignToUser(params: {
		providerId: string
		sessionEmail: string
		provider: {
			id: string
			displayName: string
			legalName: string
			status?: "draft" | "active" | "archived"
		}
	}): Promise<void> {
		await db.transaction(async (tx) => {
			await tx.insert(Provider).values(params.provider)

			const user = await tx
				.select({ id: User.id })
				.from(User)
				.where(eq(User.email, params.sessionEmail))
				.get()
			if (!user?.id) return

			const existingLink = await tx
				.select({ id: ProviderUser.id })
				.from(ProviderUser)
				.where(
					and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, user.id))
				)
				.get()
			if (!existingLink) {
				await tx.insert(ProviderUser).values({
					id: crypto.randomUUID(),
					providerId: params.providerId,
					userId: user.id,
					role: "owner",
				})
			}
		})
	}

	async ensureProviderUserOwnerLink(params: {
		providerId: string
		userId: string
	}): Promise<boolean> {
		if (!params.providerId || !params.userId) return false
		try {
			const existingLink = await db
				.select({ id: ProviderUser.id })
				.from(ProviderUser)
				.where(
					and(
						eq(ProviderUser.providerId, params.providerId),
						eq(ProviderUser.userId, params.userId)
					)
				)
				.get()
			if (existingLink?.id) return true

			await db.insert(ProviderUser).values({
				id: crypto.randomUUID(),
				providerId: params.providerId,
				userId: params.userId,
				role: "owner",
			})
			return true
		} catch {
			return false
		}
	}
}
