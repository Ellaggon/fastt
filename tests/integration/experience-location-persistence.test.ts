import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
	db,
	eq,
	Provider,
	Product,
	Tour,
	ProductLocation,
	ProductGeoPlace,
	ProductGeoPlaceActivity,
	ProviderAuditLog,
	GeoPlace,
	User,
} from "@/shared/infrastructure/db/compat"
import { upsertGeoPlace, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"
const mocks = vi.hoisted(() => ({ session: vi.fn(), refresh: vi.fn() }))
vi.mock("@/lib/auth/providerSessionSurface", () => ({
	getProviderSessionSurfaceFromRequest: mocks.session,
}))
vi.mock("@/container", async () => {
	const { ProductRepository } =
		await import("@/modules/catalog/infrastructure/repositories/ProductRepository")
	return { productRepository: new ProductRepository() }
})
vi.mock("@/lib/cache/invalidation", () => ({ invalidateProduct: async () => {} }))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: mocks.refresh,
}))
import { POST } from "@/pages/api/product/location"
let providerId: string, productId: string, placeId: string, nextPlaceId: string, actorId: string
beforeEach(async () => {
	providerId = randomUUID()
	productId = randomUUID()
	placeId = randomUUID()
	nextPlaceId = randomUUID()
	actorId = randomUUID()
	await db
		.insert(Provider)
		.values({
			id: providerId,
			accountPurpose: "integration_certification",
			dataClassification: "production",
		})
	await db.insert(User).values({ id: actorId, email: `${actorId}@location.test` })
	for (const id of [placeId, nextPlaceId])
		await upsertGeoPlace({
			id,
			name: "Lugar de prueba",
			type: "city",
			country: "BO",
			slug: `location-${id}`,
		})
	await upsertProduct({
		id: productId,
		providerId,
		name: "Clase controlada",
		productType: "tour",
		geoPlaceId: placeId,
		dataClass: "fixture",
	})
	await db
		.insert(Tour)
		.values({
			productId,
			experienceFormat: "class",
			formatContractVersion: 1,
			meetingPointJson: { address: "Sala anterior", instructions: "Antes", internal: "conservar" },
			itineraryJson: [{ description: "Práctica" }],
		})
	await db
		.insert(ProductLocation)
		.values({ productId, address: "Zona anterior", lat: -16, lng: -68 })
	mocks.session.mockResolvedValue({
		providerId,
		userId: actorId,
		permissions: { canEditProfile: true },
	})
	mocks.refresh.mockResolvedValue(undefined)
})
afterEach(async () => {
	await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
	await db.delete(ProductGeoPlaceActivity).where(eq(ProductGeoPlaceActivity.productId, productId))
	await db.delete(ProductLocation).where(eq(ProductLocation.productId, productId))
	await db.delete(Tour).where(eq(Tour.productId, productId))
	await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, productId))
	await db.delete(Product).where(eq(Product.id, productId))
	for (const id of [placeId, nextPlaceId]) await db.delete(GeoPlace).where(eq(GeoPlace.id, id))
	await db.delete(User).where(eq(User.id, actorId))
	await db.delete(Provider).where(eq(Provider.id, providerId))
})
const call = (fields: Record<string, string> = {}) => {
	const form = new FormData()
	for (const [key, value] of Object.entries({
		productId,
		geoPlaceId: nextPlaceId,
		address: "Zona nueva",
		lat: "-17",
		lng: "-67",
		expectedExperienceFormat: "class",
		meetingPointAddress: "Sala nueva",
		meetingPointInstructions: "Entrada norte",
		...fields,
	}))
		form.set(key, value)
	return POST({
		request: new Request("http://localhost/api/product/location", { method: "POST", body: form }),
	} as never)
}
const read = async () => ({
	tour: await db.select().from(Tour).where(eq(Tour.productId, productId)),
	location: await db.select().from(ProductLocation).where(eq(ProductLocation.productId, productId)),
	places: await db.select().from(ProductGeoPlace).where(eq(ProductGeoPlace.productId, productId)),
	audit: await db
		.select()
		.from(ProviderAuditLog)
		.where(eq(ProviderAuditLog.providerId, providerId)),
	activity: await db
		.select()
		.from(ProductGeoPlaceActivity)
		.where(eq(ProductGeoPlaceActivity.productId, productId)),
})
it("real route atomically saves place, location and encounter; preserves JSON and retries without duplicate audit", async () => {
	const before = await read()
	expect((await call()).status).toBe(200)
	const after = await read()
	expect(after.tour[0]).toEqual({
		...before.tour[0],
		meetingPointJson: {
			address: "Sala nueva",
			instructions: "Entrada norte",
			internal: "conservar",
		},
	})
	expect(after.location[0]).toMatchObject({ lat: -17, lng: -67, address: "Zona nueva" })
	expect(after.places[0].placeId).toBe(nextPlaceId)
	expect(after.audit).toHaveLength(1)
	expect((await call()).status).toBe(200)
	expect(await read()).toEqual(after)
})
it("late database failure rolls back every earlier write", async () => {
	const before = await read()
	mocks.session.mockResolvedValue({
		providerId,
		userId: randomUUID(),
		permissions: { canEditProfile: true },
	})
	expect((await call()).status).toBe(500)
	expect(await read()).toEqual(before)
})
it("post-commit refresh failure confirms persisted data", async () => {
	mocks.refresh.mockRejectedValue(new Error("refresh failed"))
	const response = await call()
	expect(response.status).toBe(200)
	expect(await response.json()).toMatchObject({ saved: true, refreshPending: true })
	expect((await read()).tour[0].meetingPointJson).toMatchObject({ address: "Sala nueva" })
})
it.each(["foreign", "permission", "format", "empty"])("%s rejects without writes", async (kind) => {
	const before = await read()
	if (kind === "foreign")
		mocks.session.mockResolvedValue({
			providerId: randomUUID(),
			userId: actorId,
			permissions: { canEditProfile: true },
		})
	if (kind === "permission")
		mocks.session.mockResolvedValue({
			providerId,
			userId: actorId,
			permissions: { canEditProfile: false },
		})
	const response = await call(
		kind === "format"
			? { expectedExperienceFormat: "workshop" }
			: kind === "empty"
				? { meetingPointAddress: "" }
				: {}
	)
	expect(response.ok).toBe(false)
	expect(await read()).toEqual(before)
})
