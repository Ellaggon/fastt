import { describe, expect, it } from "vitest"

import { filterProviderContractSurfaceByScope } from "@/lib/commercial-policy/filter-provider-contract-surface"
import type { ProviderContractSurface } from "@/lib/commercial-policy/provider-contract-surface"

const baseModel: ProviderContractSurface = {
	holderStatus: "declared",
	collectionSummaryLabel: "Se declara por línea de negocio",
	collectionSummaryDetail: "Detalle global",
	offerings: [
		{
			productId: "hotel-1",
			name: "Hotel QA",
			commercialLine: "lodging",
			verticalLabel: "Alojamiento",
			collectionModelLabel: "El proveedor cobra al viajero",
			country: "BO",
			status: "approved",
			statusLabel: "Contrato aprobado",
			detail: "ok",
			platformCollectionAvailable: false,
		},
		{
			productId: "tour-1",
			name: "Tour QA",
			commercialLine: "tour",
			verticalLabel: "Tour",
			collectionModelLabel: "El proveedor cobra al viajero",
			country: "BO",
			status: "approved",
			statusLabel: "Contrato aprobado",
			detail: "ok",
			platformCollectionAvailable: false,
		},
	],
	liveMoneyAvailable: false,
	verificationHref: "/provider/settings/verification/payments",
}

describe("filterProviderContractSurfaceByScope", () => {
	it("filters offerings by commercial line", () => {
		const filtered = filterProviderContractSurfaceByScope(baseModel, {
			valid: true,
			vertical: "tour",
			line: "tour",
			productIds: ["tour-1"],
			product: null,
			vocabulary: {} as any,
			availableVerticals: ["tour"],
		})
		expect(filtered.offerings).toHaveLength(1)
		expect(filtered.offerings[0]?.productId).toBe("tour-1")
		expect(filtered.collectionSummaryDetail).toContain("tours")
	})
})
