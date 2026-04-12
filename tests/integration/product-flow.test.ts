import { describe, it, expect } from "vitest"

import { productRepository, productImageRepository, subtypeRepository } from "@/container"
import {
	createProduct,
	upsertProductContent,
	upsertProductLocation,
	evaluateProductReadiness,
} from "@/modules/catalog/public"

import { upsertDestination } from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

describe("integration/catalog Product V2 flow", () => {
	it("create -> content -> location -> images -> subtype -> evaluate => ready", async () => {
		const destinationId = "dest_int_product_v2"
		const providerId = "prov_int_product_v2"
		const productId = `prod_int_product_v2_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Product V2 Test Destination",
			type: "city",
			country: "CL",
			slug: "product-v2-test-destination",
		})

		await upsertProvider({
			id: providerId,
			displayName: "Product V2 Test Provider",
			ownerEmail: "provider-v2@example.com",
		})

		await createProduct(
			{ repo: productRepository },
			{
				id: productId,
				name: "Product V2 Integration",
				productType: "Hotel",
				providerId,
				destinationId,
			}
		)

		await upsertProductContent(
			{ repo: productRepository },
			{
				productId,
				highlightsJson: JSON.stringify(["Great location"]),
				rules: "No smoking",
			}
		)

		await upsertProductLocation(
			{ repo: productRepository },
			{
				productId,
				address: "Test Address",
				lat: -16.4958,
				lng: -68.1333,
			}
		)

		// Attach images using the real repository (no R2 calls).
		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/product-v2.jpg",
			order: 0,
			isPrimary: true,
		})

		// Attach subtype using the real repository (minimal hotel row).
		await subtypeRepository.insertHotelStandalone({ productId })

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("ready")
		expect(evaluated.validationErrors).toEqual([])

		const agg = await productRepository.getProductAggregate(productId)
		expect(agg).not.toBeNull()
		expect(agg!.status?.state).toBe("ready")
		expect(agg!.status?.validationErrorsJson).toBeNull()
		expect(agg!.imagesCount).toBeGreaterThanOrEqual(1)
		expect(agg!.subtypeExists).toBe(true)
	})

	it("missing content => draft", async () => {
		const destinationId = "dest_int_product_v2"
		const providerId = "prov_int_product_v2"
		const productId = `prod_int_product_v2_missing_content_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Product V2 Test Destination",
			type: "city",
			country: "CL",
			slug: "product-v2-test-destination",
		})

		await upsertProvider({
			id: providerId,
			displayName: "Product V2 Test Provider",
			ownerEmail: "provider-v2@example.com",
		})

		await createProduct(
			{ repo: productRepository },
			{
				id: productId,
				name: "Product V2 Missing Content",
				productType: "Hotel",
				providerId,
				destinationId,
			}
		)

		await upsertProductLocation(
			{ repo: productRepository },
			{
				productId,
				address: null,
				lat: -16.4958,
				lng: -68.1333,
			}
		)

		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/product-v2.jpg",
			order: 0,
			isPrimary: true,
		})

		await subtypeRepository.insertHotelStandalone({ productId })

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_content")).toBe(true)
	})

	it("missing location => draft", async () => {
		const destinationId = "dest_int_product_v2"
		const providerId = "prov_int_product_v2"
		const productId = `prod_int_product_v2_missing_location_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Product V2 Test Destination",
			type: "city",
			country: "CL",
			slug: "product-v2-test-destination",
		})

		await upsertProvider({
			id: providerId,
			displayName: "Product V2 Test Provider",
			ownerEmail: "provider-v2@example.com",
		})

		await createProduct(
			{ repo: productRepository },
			{
				id: productId,
				name: "Product V2 Missing Location",
				productType: "Hotel",
				providerId,
				destinationId,
			}
		)

		await upsertProductContent(
			{ repo: productRepository },
			{
				productId,
				highlightsJson: JSON.stringify(["Great location"]),
				rules: null,
			}
		)

		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/product-v2.jpg",
			order: 0,
			isPrimary: true,
		})

		await subtypeRepository.insertHotelStandalone({ productId })

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_location")).toBe(true)
	})

	it("missing images => draft", async () => {
		const destinationId = "dest_int_product_v2"
		const providerId = "prov_int_product_v2"
		const productId = `prod_int_product_v2_missing_images_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Product V2 Test Destination",
			type: "city",
			country: "CL",
			slug: "product-v2-test-destination",
		})

		await upsertProvider({
			id: providerId,
			displayName: "Product V2 Test Provider",
			ownerEmail: "provider-v2@example.com",
		})

		await createProduct(
			{ repo: productRepository },
			{
				id: productId,
				name: "Product V2 Missing Images",
				productType: "Hotel",
				providerId,
				destinationId,
			}
		)

		await upsertProductContent(
			{ repo: productRepository },
			{
				productId,
				highlightsJson: JSON.stringify(["Great location"]),
				rules: null,
			}
		)

		await upsertProductLocation(
			{ repo: productRepository },
			{
				productId,
				address: null,
				lat: -16.4958,
				lng: -68.1333,
			}
		)

		await subtypeRepository.insertHotelStandalone({ productId })

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_images")).toBe(true)
	})

	it("missing subtype => draft", async () => {
		const destinationId = "dest_int_product_v2"
		const providerId = "prov_int_product_v2"
		const productId = `prod_int_product_v2_missing_subtype_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Product V2 Test Destination",
			type: "city",
			country: "CL",
			slug: "product-v2-test-destination",
		})

		await upsertProvider({
			id: providerId,
			displayName: "Product V2 Test Provider",
			ownerEmail: "provider-v2@example.com",
		})

		await createProduct(
			{ repo: productRepository },
			{
				id: productId,
				name: "Product V2 Missing Subtype",
				productType: "Hotel",
				providerId,
				destinationId,
			}
		)

		await upsertProductContent(
			{ repo: productRepository },
			{
				productId,
				highlightsJson: JSON.stringify(["Great location"]),
				rules: null,
			}
		)

		await upsertProductLocation(
			{ repo: productRepository },
			{
				productId,
				address: null,
				lat: -16.4958,
				lng: -68.1333,
			}
		)

		await productImageRepository.insertImage({
			productId,
			url: "https://example.com/product-v2.jpg",
			order: 0,
			isPrimary: true,
		})

		const evaluated = await evaluateProductReadiness({ repo: productRepository }, { productId })
		expect(evaluated.state).toBe("draft")
		expect(evaluated.validationErrors.some((e) => e.code === "missing_subtype")).toBe(true)
	})
})
