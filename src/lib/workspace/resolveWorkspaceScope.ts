import { normalizeProductVertical } from "@/lib/catalog/productVerticalRegistry"
import {
	resolveBookingWorkspaceContext,
	type BookingVertical,
	type BookingWorkspaceResolution,
} from "@/lib/booking/bookingWorkspaceContext"
import { getVerticalOpsVocabulary, type VerticalOpsVocabulary } from "@/lib/verticalVocabulary"
import type { CommercialLine } from "@/lib/verification/commercial-lines"

export type WorkspaceScopeProduct = {
	id: string
	name: string
	productType: string
}

export type WorkspaceScopeResolved = {
	valid: true
	vertical: BookingVertical | null
	line: CommercialLine | null
	productIds: string[]
	product: WorkspaceScopeProduct | null
	vocabulary: VerticalOpsVocabulary
	availableVerticals: BookingVertical[]
}

export type WorkspaceScopeInvalid = Extract<BookingWorkspaceResolution, { valid: false }>

export type WorkspaceScopeResolution = WorkspaceScopeResolved | WorkspaceScopeInvalid

function productMatchesVertical(productType: unknown, vertical: BookingVertical | null): boolean {
	if (!vertical) return true
	const normalized = normalizeProductVertical(productType)
	if (vertical === "tour") return normalized === "tour"
	if (vertical === "hotel") return normalized === "hotel" || normalized === "rental"
	return false
}

function lineForVertical(vertical: BookingVertical | null): CommercialLine | null {
	if (vertical === "tour") return "tour"
	if (vertical === "hotel") return "lodging"
	return null
}

/**
 * Shared operational scope for provider workspaces (reservations, finances, rates).
 * Vertical selection reuses booking fail-closed rules; product lists never default to
 * the first catalog item when only a line is selected.
 */
export function resolveWorkspaceScope(input: {
	requestedScope?: unknown
	productId?: unknown
	productTypes?: readonly unknown[]
	commercialLines?: readonly string[]
	products?: readonly WorkspaceScopeProduct[]
	verifiedProductType?: unknown
}): WorkspaceScopeResolution {
	const products = input.products ?? []
	const requestedProductId = String(input.productId ?? "").trim()
	const catalogProduct = requestedProductId
		? products.find((product) => product.id === requestedProductId)
		: null
	const verifiedProductType = input.verifiedProductType ?? catalogProduct?.productType

	const booking = resolveBookingWorkspaceContext({
		productTypes: input.productTypes,
		commercialLines: input.commercialLines,
		requestedScope: input.requestedScope,
		verifiedProductType,
	})

	if (!booking.valid) return booking

	const vertical = booking.vertical
	const scopedProducts = products.filter((product) =>
		productMatchesVertical(product.productType, vertical)
	)
	const productIds = scopedProducts.map((product) => product.id)

	if (requestedProductId) {
		if (!catalogProduct) {
			return {
				valid: false,
				reason: "scope_product_mismatch",
				requestedScope: requestedProductId,
			}
		}
		if (vertical && !productMatchesVertical(catalogProduct.productType, vertical)) {
			return {
				valid: false,
				reason: "scope_product_mismatch",
				requestedScope: String(input.requestedScope ?? vertical),
			}
		}
	}

	const product =
		requestedProductId &&
		catalogProduct &&
		productMatchesVertical(catalogProduct.productType, vertical)
			? catalogProduct
			: null

	return {
		valid: true,
		vertical,
		line: lineForVertical(vertical),
		productIds,
		product,
		vocabulary: getVerticalOpsVocabulary(vertical ?? "generic"),
		availableVerticals: booking.availableVerticals,
	}
}
