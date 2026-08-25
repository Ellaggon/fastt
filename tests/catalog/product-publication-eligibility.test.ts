import { describe, expect, it, vi } from "vitest"

import type { ProductAggregate, ProductRepositoryPort } from "@/modules/catalog/public"
import { publishProduct } from "@/modules/catalog/public"

const readyAggregate: ProductAggregate = {
	product: {
		id: "product_1",
		name: "Hotel de prueba",
		productType: "hotel",
		providerId: "provider_1",
		geoPlaceId: "place_1",
	},
	imagesCount: 1,
	subtypeExists: true,
	content: { productId: "product_1", highlightsJson: ["Ubicación central"], seoJson: null },
	location: { productId: "product_1", address: null, lat: -16.5, lng: -68.13 },
	verticalReadiness: {
		kind: "hotel",
		subtypeExists: true,
		hotel: { variantCount: 1, completeRoomCount: 1 },
	},
	status: null,
}

function makeRepo(eligible: boolean): ProductRepositoryPort {
	return {
		createProductBase: vi.fn(async () => {}),
		upsertProductContent: vi.fn(async () => {}),
		upsertProductLocation: vi.fn(async () => {}),
		upsertProductStatus: vi.fn(async () => {}),
		getProductAggregate: vi.fn(async () => readyAggregate),
		getProductPublicationEligibility: vi.fn(async () => ({
			eligible,
			reason: eligible ? null : ("not_production" as const),
		})),
	}
}

describe("catalog/product/publishProduct", () => {
	it("returns a business validation instead of relying on the database trigger", async () => {
		const repo = makeRepo(false)

		const result = await publishProduct({ repo }, { productId: "product_1" })

		expect(result).toMatchObject({ ok: false, state: "ready" })
		expect(result.validationErrors).toEqual([
			expect.objectContaining({ code: "PUBLICATION_OWNER_INELIGIBLE" }),
		])
		expect(repo.upsertProductStatus).toHaveBeenCalledWith(
			expect.objectContaining({ state: "ready" })
		)
		expect(repo.upsertProductStatus).not.toHaveBeenCalledWith(
			expect.objectContaining({ state: "published" })
		)
	})

	it("publishes only after the commercial eligibility check passes", async () => {
		const repo = makeRepo(true)

		const result = await publishProduct({ repo }, { productId: "product_1" })

		expect(result.ok).toBe(true)
		expect(repo.upsertProductStatus).toHaveBeenLastCalledWith({
			productId: "product_1",
			state: "published",
			validationErrorsJson: null,
		})
	})
})
