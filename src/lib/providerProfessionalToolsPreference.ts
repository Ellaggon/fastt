import { db, eq, ProviderProfile } from "astro:db"

export type ProviderProfessionalToolsPreferenceState = {
	providerId: string
	professionalToolsEnabled: boolean
	updatedAt: Date | null
	updatedBy: string | null
}

function isMissingProfessionalToolsPreferenceShape(error: unknown): boolean {
	const message = String((error as { message?: unknown })?.message ?? error)
	return (
		message.includes("no such table: ProviderProfile") ||
		message.includes("no such column: ProviderProfile.professionalToolsEnabled") ||
		message.includes("no such column: professionalToolsEnabled")
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

export async function getProviderProfessionalToolsPreference(
	providerId: string
): Promise<ProviderProfessionalToolsPreferenceState> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return defaultPreference("")
	try {
		const row = await db
			.select({
				providerId: ProviderProfile.providerId,
				professionalToolsEnabled: ProviderProfile.professionalToolsEnabled,
				updatedAt: ProviderProfile.professionalToolsUpdatedAt,
				updatedBy: ProviderProfile.professionalToolsUpdatedBy,
			})
			.from(ProviderProfile)
			.where(eq(ProviderProfile.providerId, normalizedProviderId))
			.get()
		if (!row) return defaultPreference(normalizedProviderId)
		return {
			providerId: String(row.providerId),
			professionalToolsEnabled: Boolean(row.professionalToolsEnabled),
			updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
			updatedBy: row.updatedBy ? String(row.updatedBy) : null,
		}
	} catch (error) {
		if (isMissingProfessionalToolsPreferenceShape(error)) {
			return defaultPreference(normalizedProviderId)
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
			.get()
		if (!profile) {
			throw new Error(
				"Completa el perfil operativo del proveedor antes de activar herramientas profesionales."
			)
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
