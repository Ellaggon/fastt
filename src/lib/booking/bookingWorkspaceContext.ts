import { normalizeProductVertical } from "@/lib/catalog/productVerticalRegistry"

export type BookingVertical = "hotel" | "tour"

export type BookingWorkspaceResolution =
	| {
			valid: true
			vertical: BookingVertical | null
			availableVerticals: BookingVertical[]
	  }
	| {
			valid: false
			reason: "unsupported_scope" | "scope_unavailable" | "scope_product_mismatch"
			requestedScope: string
	  }

function supportedVertical(value: unknown): BookingVertical | null {
	const vertical = normalizeProductVertical(value)
	return vertical === "hotel" || vertical === "tour" ? vertical : null
}

/**
 * Resolves the reservations vocabulary/filter from provider-owned products,
 * declared business lines, and (when present) an already ownership-checked
 * product. A malformed or unavailable explicit scope is never silently
 * replaced by another business line.
 */
export function resolveBookingWorkspaceContext(input: {
	productTypes?: readonly unknown[]
	commercialLines?: readonly string[]
	requestedScope?: unknown
	verifiedProductType?: unknown
}): BookingWorkspaceResolution {
	const available = new Set<BookingVertical>()
	for (const productType of input.productTypes ?? []) {
		const vertical = supportedVertical(productType)
		if (vertical) available.add(vertical)
	}
	for (const line of input.commercialLines ?? []) {
		if (line === "lodging") available.add("hotel")
		if (line === "tour") available.add("tour")
	}

	const verifiedProductVertical = supportedVertical(input.verifiedProductType)
	if (verifiedProductVertical) available.add(verifiedProductVertical)
	const requested = String(input.requestedScope ?? "")
		.trim()
		.toLowerCase()
	const availableVerticals = [...available].sort()

	if (!requested) {
		return {
			valid: true,
			vertical:
				verifiedProductVertical ??
				(availableVerticals.length === 1 ? (availableVerticals[0] ?? null) : null),
			availableVerticals,
		}
	}

	if (requested === "all") {
		if (verifiedProductVertical)
			return { valid: false, reason: "scope_product_mismatch", requestedScope: requested }
		return { valid: true, vertical: null, availableVerticals }
	}

	const selectedVertical = supportedVertical(requested)
	if (!selectedVertical)
		return { valid: false, reason: "unsupported_scope", requestedScope: requested }
	if (verifiedProductVertical && selectedVertical !== verifiedProductVertical)
		return { valid: false, reason: "scope_product_mismatch", requestedScope: requested }
	if (!available.has(selectedVertical))
		return { valid: false, reason: "scope_unavailable", requestedScope: requested }

	return { valid: true, vertical: selectedVertical, availableVerticals }
}
