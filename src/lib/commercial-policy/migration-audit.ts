import { isProviderDocumentExpired } from "@/lib/provider-document-validity"

export type CommercialEvidenceMigrationClass =
	| "pending_review"
	| "historical_non_granting"
	| "expired_requires_renewal"
	| "legacy_generic_requires_scope"
	| "scoped_requires_policy_match"

export type MigrationEvidenceInput = {
	status: string
	expiresAt?: Date | string | null
	scopeCount: number
}

/**
 * A migration classification, never an authorization result. In particular,
 * legacy provider-wide documents remain visible as history but cannot become
 * commercial evidence until a signed policy explicitly accepts that scope.
 */
export function classifyCommercialEvidenceMigration(
	input: MigrationEvidenceInput,
	now = new Date()
): CommercialEvidenceMigrationClass {
	if (input.status === "pending") return "pending_review"
	if (input.status !== "verified") return "historical_non_granting"
	const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
	if (isProviderDocumentExpired(expiresAt, now)) return "expired_requires_renewal"
	if (input.scopeCount <= 0) return "legacy_generic_requires_scope"
	return "scoped_requires_policy_match"
}

export type ProviderVerticalClass = "hotel" | "tour" | "mixed" | "other"

export function classifyProviderVerticals(productTypes: string[]): ProviderVerticalClass {
	const types = new Set(productTypes.map((value) => String(value).trim().toLowerCase()))
	const hotel = types.has("hotel")
	const tour = types.has("tour")
	if (hotel && tour) return "mixed"
	if (hotel) return "hotel"
	if (tour) return "tour"
	return "other"
}
