import type { WorkspaceScopeResolved } from "@/lib/workspace/resolveWorkspaceScope"
import { commercialLineForProductType } from "@/lib/verification/commercial-lines"

import type { ProviderContractSurface } from "./provider-contract-surface"

export function filterProviderContractSurfaceByScope(
	model: ProviderContractSurface,
	scope: WorkspaceScopeResolved
): ProviderContractSurface {
	const scopedProductId = scope.product?.id ?? null
	const scopedLine = scope.line ?? null
	const offerings = model.offerings.filter((offering) => {
		if (scopedProductId) return offering.productId === scopedProductId
		if (scopedLine) return offering.commercialLine === scopedLine
		return true
	})
	const collectionSummaryDetail =
		scopedLine === "tour"
			? "Condiciones contractuales de la línea tours en el contexto financiero actual."
			: scopedLine === "lodging"
				? "Condiciones contractuales de la línea alojamiento en el contexto financiero actual."
				: scopedProductId && offerings[0]
					? `Condiciones contractuales de ${offerings[0].name}.`
					: model.collectionSummaryDetail
	return {
		...model,
		collectionSummaryDetail,
		offerings,
	}
}

export function commercialLineForOfferingProductType(productType: unknown) {
	return commercialLineForProductType(productType)
}
