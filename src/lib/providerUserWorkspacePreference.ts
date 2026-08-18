import { and, db, eq, first, ProviderUser } from "@/shared/infrastructure/db/compat"
import { invalidateAuthContextForUser } from "@/lib/auth/authCache"
import { invalidateProviderWorkspaceExperience } from "@/lib/cache/invalidation"

export type WorkspaceExperience = "essential" | "professional"

/**
 * Workspace experience is deliberately a member preference. Keeping the
 * writable fields explicit prevents this path from ever becoming a provider
 * configuration or commercial-operation mutation.
 */
const WORKSPACE_EXPERIENCE_FIELDS = ["workspaceExperience", "workspaceExperienceUpdatedAt"] as const

export type ProviderUserWorkspacePreference = {
	providerId: string
	userId: string
	experience: WorkspaceExperience
	updatedAt: Date | null
}

export type ProviderUserWorkspacePreferenceRead = ProviderUserWorkspacePreference & {
	schemaAvailable: boolean
}

function normalizeExperience(value: unknown): WorkspaceExperience {
	return String(value ?? "")
		.trim()
		.toLowerCase() === "professional"
		? "professional"
		: "essential"
}

function fallbackPreference(params: {
	providerId: string
	userId: string
}): ProviderUserWorkspacePreference {
	return {
		providerId: params.providerId,
		userId: params.userId,
		experience: "essential",
		updatedAt: null,
	}
}

export function isMissingProviderUserWorkspacePreferenceShape(error: unknown): boolean {
	const message = String((error as { message?: unknown })?.message ?? error)
	return (
		message.includes("no such table: ProviderUser") ||
		message.includes("no such column: ProviderUser.workspaceExperience") ||
		message.includes("no such column: ProviderUser.workspaceExperienceUpdatedAt") ||
		message.includes("workspaceExperience")
	)
}

async function readPreference(params: {
	providerId: string
	userId: string
}): Promise<ProviderUserWorkspacePreference> {
	const row = await db
		.select({
			providerId: ProviderUser.providerId,
			userId: ProviderUser.userId,
			experience: ProviderUser.workspaceExperience,
			updatedAt: ProviderUser.workspaceExperienceUpdatedAt,
		})
		.from(ProviderUser)
		.where(
			and(eq(ProviderUser.providerId, params.providerId), eq(ProviderUser.userId, params.userId))
		)
		.then(first)

	if (!row) return fallbackPreference(params)
	return {
		providerId: String(row.providerId),
		userId: String(row.userId),
		experience: normalizeExperience(row.experience),
		updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
	}
}

export async function getProviderUserWorkspacePreferenceRead(params: {
	providerId: string
	userId: string
}): Promise<ProviderUserWorkspacePreferenceRead> {
	const providerId = String(params.providerId ?? "").trim()
	const userId = String(params.userId ?? "").trim()
	const fallback = fallbackPreference({ providerId, userId })
	if (!providerId || !userId) return { ...fallback, schemaAvailable: false }

	try {
		return { ...(await readPreference({ providerId, userId })), schemaAvailable: true }
	} catch (error) {
		if (isMissingProviderUserWorkspacePreferenceShape(error)) {
			return { ...fallback, schemaAvailable: false }
		}
		throw error
	}
}

export async function setProviderUserWorkspaceExperience(params: {
	providerId: string
	userId: string
	experience: WorkspaceExperience
}): Promise<ProviderUserWorkspacePreference> {
	const providerId = String(params.providerId ?? "").trim()
	const userId = String(params.userId ?? "").trim()
	if (!providerId || !userId) throw new Error("Provider membership is required")

	try {
		const updated = await db
			.update(ProviderUser)
			.set({
				workspaceExperience: params.experience,
				workspaceExperienceUpdatedAt: new Date(),
			})
			.where(and(eq(ProviderUser.providerId, providerId), eq(ProviderUser.userId, userId)))
			.returning({
				providerId: ProviderUser.providerId,
				userId: ProviderUser.userId,
				experience: ProviderUser.workspaceExperience,
				updatedAt: ProviderUser.workspaceExperienceUpdatedAt,
			})
			.then(first)
		if (!updated) throw new Error("Provider membership is required")

		const preference: ProviderUserWorkspacePreference = {
			providerId: String(updated.providerId),
			userId: String(updated.userId),
			experience: normalizeExperience(updated.experience),
			updatedAt: updated.updatedAt ? new Date(updated.updatedAt) : null,
		}
		await Promise.all([
			invalidateAuthContextForUser(userId),
			invalidateProviderWorkspaceExperience({ providerId, userId }),
		])
		return preference
	} catch (error) {
		if (isMissingProviderUserWorkspacePreferenceShape(error)) {
			throw new Error("User workspace preferences schema is not migrated")
		}
		throw error
	}
}

export const providerUserWorkspaceExperienceContract = {
	entity: "ProviderUser",
	writableFields: WORKSPACE_EXPERIENCE_FIELDS,
	neverMutates: [
		"ProviderProfile",
		"Product",
		"Variant",
		"RatePlan",
		"Booking",
		"TaxFeeDefinition",
		"TaxFeeAssignment",
	],
} as const
