export type WholeHomeUnitDraft = {
	productId: string
	productType: string
	providerId: string
	variantId: string
	variantKind: string
	variantProductId: string
	resourceId: string
	resourceVariantId: string | null
	resourceProviderId: string | null
	unitCount: number
	exclusiveUse: boolean
}

/** Rejects a hotel room masquerading as an entire dwelling. */
export function assertWholeHomeUnitContract(value: WholeHomeUnitDraft): void {
	if (value.productType !== "whole_home" || value.variantKind !== "whole_home") {
		throw new Error("WHOLE_HOME_KIND_REQUIRED")
	}
	if (!value.exclusiveUse || value.unitCount !== 1) {
		throw new Error("WHOLE_HOME_EXCLUSIVE_UNIT_REQUIRED")
	}
	if (
		value.variantProductId !== value.productId ||
		value.resourceVariantId !== value.variantId ||
		value.resourceProviderId !== value.providerId
	) {
		throw new Error("WHOLE_HOME_PHYSICAL_RESOURCE_MISMATCH")
	}
}
