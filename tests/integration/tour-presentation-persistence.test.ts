import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, expect, it } from "vitest"
import {
	db,
	eq,
	inArray,
	Product,
	Provider,
	User,
	GeoPlace,
	ProductCategory,
	ProductCategoryLink,
	ProductContent,
	ProductGeoPlace,
	ProductGeoPlaceActivity,
	ProviderCommercialLine,
} from "@/shared/infrastructure/db/compat"
import { ProductRepository } from "@/modules/catalog/infrastructure/repositories/ProductRepository"
import { saveTourPresentation } from "@/modules/catalog/application/use-cases/product/save-tour-presentation"

const providerId = randomUUID(),
	actorId = randomUUID()
const productIds = Array.from({ length: 3 }, () => randomUUID())
const placeIds = [randomUUID(), randomUUID()],
	categoryId = randomUUID()
const repo = new ProductRepository()
const input = {
	productId: productIds[0],
	mode: "create",
	name: "Paseo cultural",
	geoPlaceId: placeIds[0],
	description: "Recorre el centro histórico acompañado de un guía.",
	highlights: ["Arquitectura local", "Historias de la ciudad"],
	categoryIds: [categoryId],
	intent: "continue",
}
const actor = { providerId, actorId }
beforeAll(async () => {
	await db.insert(User).values({ id: actorId, email: `${actorId}@presentation.test` })
	await db
		.insert(Provider)
		.values({ id: providerId, accountPurpose: "commercial", dataClassification: "production" })
	await db.insert(GeoPlace).values(
		placeIds.map((id) => ({
			id,
			canonicalName: "Ciudad",
			normalizedName: id,
			slug: id,
			canonicalPath: `/bolivia/${id}`,
			placeType: "city",
			countryCode: "BO",
		}))
	)
	await db.insert(ProductCategory).values({
		id: categoryId,
		slug: `cultura-${categoryId.replaceAll("-", "").replace(/[0-9a-f]/g, (char) => String.fromCharCode(103 + parseInt(char, 16)))}`,
		name: "Cultura",
		vertical: "tour",
		dataClass: "production",
	})
})
afterAll(async () => {
	await db.delete(ProductCategoryLink).where(inArray(ProductCategoryLink.productId, productIds))
	await db.delete(ProductContent).where(inArray(ProductContent.productId, productIds))
	await db
		.delete(ProductGeoPlaceActivity)
		.where(inArray(ProductGeoPlaceActivity.productId, productIds))
	await db.delete(ProductGeoPlace).where(inArray(ProductGeoPlace.productId, productIds))
	await db.delete(ProviderCommercialLine).where(eq(ProviderCommercialLine.providerId, providerId))
	await db.delete(Product).where(inArray(Product.id, productIds))
	await db.delete(ProductCategory).where(eq(ProductCategory.id, categoryId))
	await db.delete(GeoPlace).where(inArray(GeoPlace.id, placeIds))
	await db.delete(Provider).where(eq(Provider.id, providerId))
	await db.delete(User).where(eq(User.id, actorId))
})
it("persists the whole presentation once and reconciles a retry with the same creation ID", async () => {
	await saveTourPresentation({ repo }, input, actor)
	await saveTourPresentation({ repo }, input, actor)
	const products = await db.select().from(Product).where(eq(Product.id, input.productId))
	expect(products).toHaveLength(1)
	expect(products[0].productType).toBe("tour")
	expect(
		(await db.select().from(ProductContent).where(eq(ProductContent.productId, input.productId)))[0]
	).toMatchObject({ description: input.description, highlightsJson: input.highlights })
	expect(
		await db
			.select()
			.from(ProductCategoryLink)
			.where(eq(ProductCategoryLink.productId, input.productId))
	).toHaveLength(1)
	expect(
		await db
			.select()
			.from(ProductGeoPlaceActivity)
			.where(eq(ProductGeoPlaceActivity.productId, input.productId))
	).toHaveLength(1)
})
it("updates the existing presentation preserving editorial state and SEO", async () => {
	await db
		.update(Product)
		.set({ publicationState: "published" })
		.where(eq(Product.id, input.productId))
	await db
		.update(ProductContent)
		.set({ seoJson: { title: "Título público" } })
		.where(eq(ProductContent.productId, input.productId))
	await saveTourPresentation(
		{ repo },
		{
			...input,
			mode: "edit",
			name: "Paseo actualizado",
			description: "Descripción actualizada",
			geoPlaceId: placeIds[1],
		},
		actor
	)
	expect((await db.select().from(Product).where(eq(Product.id, input.productId)))[0]).toMatchObject(
		{ name: "Paseo actualizado", publicationState: "published", productType: "tour" }
	)
	expect(
		(await db.select().from(ProductContent).where(eq(ProductContent.productId, input.productId)))[0]
	).toMatchObject({ description: "Descripción actualizada", seoJson: { title: "Título público" } })
})
it("rolls back all changes on an intermediate database failure", async () => {
	const before = await db.select().from(Product).where(eq(Product.id, input.productId))
	await expect(
		saveTourPresentation(
			{ repo },
			{ ...input, mode: "edit", name: "No debe quedar", geoPlaceId: placeIds[0] },
			{ ...actor, actorId: randomUUID() }
		)
	).rejects.toThrow()
	expect(await db.select().from(Product).where(eq(Product.id, input.productId))).toEqual(before)
	expect(
		(
			await db.select().from(ProductGeoPlace).where(eq(ProductGeoPlace.productId, input.productId))
		)[0].placeId
	).toBe(placeIds[1])
	expect(
		(await db.select().from(ProductContent).where(eq(ProductContent.productId, input.productId)))[0]
			.description
	).toBe("Descripción actualizada")
})
it("rejects incomplete continuation and another provider without changing the tour", async () => {
	await expect(
		saveTourPresentation(
			{ repo },
			{ ...input, productId: productIds[1], description: "", categoryIds: [] },
			actor
		)
	).rejects.toThrow()
	expect(await db.select().from(Product).where(eq(Product.id, productIds[1]))).toHaveLength(0)
	await expect(
		saveTourPresentation({ repo }, input, { ...actor, providerId: randomUUID() })
	).rejects.toThrow("No encontramos")
})
it("permits a partial draft only when deliberately saving and exiting", async () => {
	await saveTourPresentation(
		{ repo },
		{
			...input,
			productId: productIds[2],
			intent: "exit",
			description: "",
			highlights: [],
			categoryIds: [],
		},
		actor
	)
	expect(
		(await db.select().from(Product).where(eq(Product.id, productIds[2])))[0].publicationState
	).toBe("draft")
})
