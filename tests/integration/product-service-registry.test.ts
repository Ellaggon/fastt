import { describePostgres as describe } from "../setup/postgres-suite"
import { expect, it } from "vitest"

import { db, eq, ProductService } from "@/shared/infrastructure/db/compat"
import { ProductServiceRepository } from "@/modules/catalog/infrastructure/repositories/ProductServiceRepository"
import { upsertGeoPlace, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

describe("product services backed by the code registry", () => {
	it("persists a valid service without a Service lookup table", async () => {
		const suffix = crypto.randomUUID()
		const productId = `service_product_${suffix}`
		await upsertGeoPlace({
			id: `service_place_${suffix}`,
			name: "La Paz",
			type: "city",
			country: "BO",
			slug: `la-paz-service-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Alojamiento con Wi-Fi",
			productType: "hotel",
			geoPlaceId: `service_place_${suffix}`,
		})

		const repository = new ProductServiceRepository()
		await repository.syncProductServices({ productId, services: [{ serviceId: "wifi" }] })

		const rows = await db
			.select({ serviceId: ProductService.serviceId })
			.from(ProductService)
			.where(eq(ProductService.productId, productId))
		expect(rows).toEqual([{ serviceId: "wifi" }])

		await expect(
			repository.syncProductServices({
				productId,
				services: [{ serviceId: "not-a-service" }],
			})
		).rejects.toThrow("UNKNOWN_SERVICE_CODES:not-a-service")
	})
})
