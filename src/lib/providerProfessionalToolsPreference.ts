import { first, db, eq, ProviderProfile } from "@/shared/infrastructure/db/compat"

const DEFAULT_PROVIDER_PROFILE_TIMEZONE = "UTC"
const DEFAULT_PROVIDER_PROFILE_CURRENCY = "USD"

export type ProviderProfessionalToolsPreferenceState = {
	providerId: string
	professionalToolsEnabled: boolean
	updatedAt: Date | null
	updatedBy: string | null
}

export type ProviderProfessionalToolsPreferenceRead = ProviderProfessionalToolsPreferenceState & {
	schemaAvailable: boolean
}

export function isMissingProfessionalToolsPreferenceShape(error: unknown): boolean {
	const message = String((error as { message?: unknown })?.message ?? error)
	return (
		message.includes("no such table: ProviderProfile") ||
		message.includes("no such column: ProviderProfile.professionalToolsEnabled") ||
		message.includes("no such column: ProviderProfile.professionalToolsUpdatedAt") ||
		message.includes("no such column: ProviderProfile.professionalToolsUpdatedBy") ||
		message.includes("no such column: professionalToolsEnabled") ||
		message.includes("no such column: professionalToolsUpdatedAt") ||
		message.includes("no such column: professionalToolsUpdatedBy") ||
		message.includes("Provider profile professional-tools schema is not migrated")
	)
}

function defaultPreference(providerId: string): ProviderProfessionalToolsPreferenceState {
	return {
		providerId,
		professionalToolsEnabled: false,
		updatedAt: null,
		updatedBy: null,
	}
}

async function readProviderProfessionalToolsPreference(
	providerId: string
): Promise<ProviderProfessionalToolsPreferenceState> {
	const row = await db
		.select({
			providerId: ProviderProfile.providerId,
			professionalToolsEnabled: ProviderProfile.professionalToolsEnabled,
			updatedAt: ProviderProfile.professionalToolsUpdatedAt,
			updatedBy: ProviderProfile.professionalToolsUpdatedBy,
		})
		.from(ProviderProfile)
		.where(eq(ProviderProfile.providerId, providerId))
		.then(first)
	if (!row) return defaultPreference(providerId)
	return {
		providerId: String(row.providerId),
		professionalToolsEnabled: Boolean(row.professionalToolsEnabled),
		updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
		updatedBy: row.updatedBy ? String(row.updatedBy) : null,
	}
}

export async function getProviderProfessionalToolsPreference(
	providerId: string
): Promise<ProviderProfessionalToolsPreferenceState> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return defaultPreference("")
	try {
		return await readProviderProfessionalToolsPreference(normalizedProviderId)
	} catch (error) {
		if (isMissingProfessionalToolsPreferenceShape(error)) {
			return defaultPreference(normalizedProviderId)
		}
		throw error
	}
}

export async function getProviderProfessionalToolsPreferenceRead(
	providerId: string
): Promise<ProviderProfessionalToolsPreferenceRead> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return { ...defaultPreference(""), schemaAvailable: false }
	try {
		return {
			...(await readProviderProfessionalToolsPreference(normalizedProviderId)),
			schemaAvailable: true,
		}
	} catch (error) {
		if (isMissingProfessionalToolsPreferenceShape(error)) {
			return { ...defaultPreference(normalizedProviderId), schemaAvailable: false }
		}
		throw error
	}
}

export async function setProviderProfessionalToolsPreference(params: {
	providerId: string
	actorUserId?: string | null
	enabled: boolean
}): Promise<ProviderProfessionalToolsPreferenceState> {
	const providerId = String(params.providerId ?? "").trim()
	if (!providerId) throw new Error("Provider is required")

	const now = new Date()

	try {
		const profile = await db
			.select({ providerId: ProviderProfile.providerId })
			.from(ProviderProfile)
			.where(eq(ProviderProfile.providerId, providerId))
			.then(first)
		if (!profile) {
			await db.insert(ProviderProfile).values({
				providerId,
				timezone: DEFAULT_PROVIDER_PROFILE_TIMEZONE,
				defaultCurrency: DEFAULT_PROVIDER_PROFILE_CURRENCY,
				supportEmail: null,
				supportPhone: null,
				professionalToolsEnabled: params.enabled,
				professionalToolsUpdatedAt: now,
				professionalToolsUpdatedBy: params.actorUserId ?? null,
			})
			return getProviderProfessionalToolsPreference(providerId)
		}

		await db
			.update(ProviderProfile)
			.set({
				professionalToolsEnabled: params.enabled,
				professionalToolsUpdatedAt: now,
				professionalToolsUpdatedBy: params.actorUserId ?? null,
			})
			.where(eq(ProviderProfile.providerId, providerId))
	} catch (error) {
		if (isMissingProfessionalToolsPreferenceShape(error)) {
			throw new Error("Provider profile professional-tools schema is not migrated")
		}
		throw error
	}

	return getProviderProfessionalToolsPreference(providerId)
}
