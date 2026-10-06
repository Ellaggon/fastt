import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, expect, it } from "vitest"
import {
	db,
	eq,
	inArray,
	Product,
	Provider,
	Variant,
	Image,
	ProductImage,
} from "@/shared/infrastructure/db/compat"
import { countProviderTours, listProviderTourCatalog } from "@/lib/catalog/providerTourCatalog"

// Isolated PostgreSQL only: fixture identifiers never reference operational tenants.
const providerId = randomUUID()
const otherProviderId = randomUUID()
const productIds = Array.from({ length: 23 }, () => randomUUID())
const variantIds = Array.from({ length: 3 }, () => randomUUID())
const imageId = randomUUID()
beforeAll(async () => {
	await db.insert(Provider).values(
		[providerId, otherProviderId].map((id) => ({
			id,
			accountPurpose: "commercial",
			dataClassification: "production",
		}))
	)
	await db.insert(Product).values(
		productIds.map((id, index) => ({
			id,
			name: `Tour ${String(index).padStart(2, "0")}`,
			productType: index === 21 ? "Hotel" : "Tour",
			providerId: index === 22 ? otherProviderId : providerId,
			publicationState: index === 0 ? "ready" : "draft",
			dataClass: "production",
			lastUpdated: new Date(Date.UTC(2026, 9, 1, 0, index)),
		}))
	)
	await db
		.update(Product)
		.set({ publicationState: "published" })
		.where(inArray(Product.id, productIds.slice(1, 4)))
	await db
		.insert(Variant)
		.values(
			variantIds.map((id) => ({ id, productId: productIds[0], name: "Opción", kind: "tour_slot" }))
		)
	await db.insert(Image).values({
		id: imageId,
		objectKey: "fixture/cover",
		url: "https://images.example.test/cover.jpg",
	})
	await db.insert(ProductImage).values({ productId: productIds[0], imageId, isPrimary: true })
})
afterAll(async () => {
	await db.delete(ProductImage).where(eq(ProductImage.imageId, imageId))
	await db.delete(Image).where(eq(Image.id, imageId))
	await db.delete(Variant).where(inArray(Variant.id, variantIds))
	await db.delete(Product).where(inArray(Product.id, productIds))
	await db.delete(Provider).where(inArray(Provider.id, [providerId, otherProviderId]))
})
it("counts owned tours once, treating historical ready as an editorial draft", async () => {
	expect(await countProviderTours(providerId)).toEqual({ total: 21, published: 3, draft: 18 })
	const result = await listProviderTourCatalog(providerId, { query: "", state: "all", page: 1 })
	expect(result.products).toHaveLength(20)
	expect(result.filteredTotal).toBe(21)
	expect(result.pageCount).toBe(2)
	expect(result.products.map((row) => row.id)).not.toContain(productIds[22])
	expect(result.products.map((row) => row.id)).not.toContain(productIds[21])
})
it("preserves stable pagination and reads the selected tour cover and three options", async () => {
	const second = await listProviderTourCatalog(providerId, { query: "", state: "all", page: 2 })
	expect(second.products).toHaveLength(1)
	expect(second.products[0]).toMatchObject({
		id: productIds[0],
		publicationState: "ready",
		optionCount: 3,
		imageUrl: "https://images.example.test/cover.jpg",
		destinationName: null,
	})
	const overflow = await listProviderTourCatalog(providerId, { query: "", state: "all", page: 999 })
	expect(overflow.page).toBe(2)
})
it("applies search and state before pagination without treating SQL wildcards as patterns", async () => {
	const published = await listProviderTourCatalog(providerId, {
		query: "Tour 0",
		state: "published",
		page: 1,
	})
	expect(published.filteredTotal).toBe(3)
	expect(published.products).toHaveLength(3)
	const draft = await listProviderTourCatalog(providerId, {
		query: "Tour 00",
		state: "draft",
		page: 1,
	})
	expect(draft.products.map((row) => row.id)).toEqual([productIds[0]])
	expect(await countProviderTours(providerId, "%")).toEqual({ total: 0, published: 0, draft: 0 })
})
