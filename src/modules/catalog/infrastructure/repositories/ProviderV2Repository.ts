import {
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
	async getProviderIdByUserEmail(email: string): Promise<string | null> {
		if (!email) return null
		const row = await db
			.select({ id: Provider.id })
			.from(Provider)
			.where(eq(Provider.userEmail, email))
			.get()
		return row?.id ?? null
	}

	async registerProvider(params: {
		provider: {
			id: string
			userEmail: string
			companyName: string
			legalName?: string | null
			displayName?: string | null
			type?: string | null
			contactName?: string | null
			contactEmail?: string | null
			phone?: string | null
			status?: "draft" | "active" | "archived"
		}
		userEmailForLink: string
		role?: "owner" | "admin" | "staff"
	}): Promise<{ providerId: string; created: boolean }> {
		// Idempotency by email: if provider already exists for this user, return it.
		const existing = await this.getProviderIdByUserEmail(params.provider.userEmail)
		if (existing) return { providerId: existing, created: false }

		// Create provider.
		await db.insert(Provider).values({
			id: params.provider.id,
			userEmail: params.provider.userEmail,
			companyName: params.provider.companyName,
			legalName: params.provider.legalName ?? null,
			displayName: params.provider.displayName ?? null,
			status: params.provider.status ?? "draft",
			contactName: params.provider.contactName ?? null,
			contactEmail: params.provider.contactEmail ?? null,
			phone: params.provider.phone ?? null,
			type: params.provider.type ?? null,
		})

		// Link provider to local User row (same behavior as v1, but only for v2 endpoint call sites).
		const user = await db
			.select({ id: User.id })
			.from(User)
			.where(eq(User.email, params.userEmailForLink))
			.get()
		if (user?.id) {
			await db.update(User).set({ providerId: params.provider.id }).where(eq(User.id, user.id))
			await db.insert(ProviderUser).values({
				id: crypto.randomUUID(),
				providerId: params.provider.id,
				userId: user.id,
				role: params.role ?? "owner",
			})
		}

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
