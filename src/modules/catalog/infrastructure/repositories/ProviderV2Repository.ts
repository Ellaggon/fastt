import {
	and,
	db,
	eq,
	Provider,
	ProviderProfile,
	ProviderUser,
	ProviderVerification,
	User,
} from "astro:db"
import type {
	ProviderV2RepositoryPort,
	ProviderVerificationStatus,
} from "../../application/ports/ProviderV2RepositoryPort"

export class ProviderV2Repository implements ProviderV2RepositoryPort {
	private async getProviderIdByUserLinkEmail(email: string): Promise<string | null> {
		if (!email) return null
		const user = await db.select({ id: User.id }).from(User).where(eq(User.email, email)).get()
		if (!user?.id) return null
		const link = await db
			.select({ providerId: ProviderUser.providerId })
			.from(ProviderUser)
			.where(eq(ProviderUser.userId, user.id))
			.get()
		return link?.providerId ?? null
	}

	private async ensureOwnerLink(params: {
		providerId: string
		userEmailForLink: string
		role: "owner" | "admin" | "staff"
	}): Promise<void> {
		const user = await db
			.select({ id: User.id })
			.from(User)
			.where(eq(User.email, params.userEmailForLink))
			.get()
		if (!user?.id) return

		const existingLink = await db
			.select({ id: ProviderUser.id })
			.from(ProviderUser)
			.where(and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, user.id)))
			.get()

		if (!existingLink) {
			await db.insert(ProviderUser).values({
				id: crypto.randomUUID(),
				providerId: params.providerId,
				userId: user.id,
				role: params.role,
			})
		}
	}

	async updateProviderIdentity(params: {
		providerId: string
		displayName?: string | null
		legalName?: string | null
	}): Promise<void> {
		const updateResult = await db
			.update(Provider)
			.set({
				displayName: params.displayName ?? null,
				legalName: params.legalName ?? null,
			})
			.where(eq(Provider.id, params.providerId))

		console.log({
			step: "repo_update_provider_identity",
			whereProviderId: params.providerId,
			updateResult,
		})
	}

	async registerProvider(params: {
		provider: {
			id: string
			legalName?: string | null
			displayName?: string | null
			status?: "draft" | "active" | "archived"
		}
		userEmailForLink: string
		role?: "owner" | "admin" | "staff"
	}): Promise<{ providerId: string; created: boolean }> {
		// Idempotency by canonical user-provider link.
		const existing = await this.getProviderIdByUserLinkEmail(params.userEmailForLink)
		if (existing) {
			await this.ensureOwnerLink({
				providerId: existing,
				userEmailForLink: params.userEmailForLink,
				role: params.role ?? "owner",
			})
			return { providerId: existing, created: false }
		}

		// Create provider.
		await db.insert(Provider).values({
			id: params.provider.id,
			legalName: params.provider.legalName ?? null,
			displayName: params.provider.displayName ?? null,
			status: params.provider.status ?? "draft",
		})

		await this.ensureOwnerLink({
			providerId: params.provider.id,
			userEmailForLink: params.userEmailForLink,
			role: params.role ?? "owner",
		})

		// Create initial verification row in pending state (parallel system).
		await db.insert(ProviderVerification).values({
			id: crypto.randomUUID(),
			providerId: params.provider.id,
			status: "pending",
		})

		return { providerId: params.provider.id, created: true }
	}

	async upsertProfile(params: {
		providerId: string
		timezone: string
		defaultCurrency: string
		supportEmail?: string | null
		supportPhone?: string | null
	}): Promise<void> {
		const existing = await db
			.select({ providerId: ProviderProfile.providerId })
			.from(ProviderProfile)
			.where(eq(ProviderProfile.providerId, params.providerId))
			.get()

		if (!existing) {
			await db.insert(ProviderProfile).values({
				providerId: params.providerId,
				timezone: params.timezone,
				defaultCurrency: params.defaultCurrency,
				supportEmail: params.supportEmail ?? null,
				supportPhone: params.supportPhone ?? null,
			})
			return
		}

		await db
			.update(ProviderProfile)
			.set({
				timezone: params.timezone,
				defaultCurrency: params.defaultCurrency,
				supportEmail: params.supportEmail ?? null,
				supportPhone: params.supportPhone ?? null,
			})
			.where(eq(ProviderProfile.providerId, params.providerId))
	}

	async setVerificationStatus(params: {
		providerId: string
		status: ProviderVerificationStatus
		reason?: string | null
		reviewedBy?: string | null
		metadataJson?: unknown
	}): Promise<void> {
		// Store the latest decision as an append-only record (new id each time).
		await db.insert(ProviderVerification).values({
			id: crypto.randomUUID(),
			providerId: params.providerId,
			status: params.status,
			reason: params.reason ?? null,
			reviewedAt: new Date(),
			reviewedBy: params.reviewedBy ?? null,
			metadataJson: params.metadataJson ?? null,
		})
	}
}
