import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, expect, it, vi } from "vitest"
import {
	db,
	eq,
	inArray,
	sql,
	User,
	Provider,
	Product,
	Tour,
	GeoPlace,
	ProductCategory,
	ProductCategoryLink,
	ProductContent,
	ProductGeoPlace,
	ProductGeoPlaceActivity,
	ProviderAuditLog,
	ProviderCommercialLine,
	Variant,
	RatePlan,
	DailyInventory,
	Booking,
} from "@/shared/infrastructure/db/compat"
import { CatalogReadModelRepository } from "@/modules/catalog/infrastructure/repositories/CatalogReadModelRepository"
import { evaluateTourContentReadiness } from "@/lib/tours/tourContentReadiness"
import { experienceCategoryFilter } from "@/lib/tours/experienceClassificationSql"
import { saveExperienceBusinessKinds } from "@/lib/provider/experience-business-kinds"
const providerId = randomUUID(),
	actorId = randomUUID(),
	productId = randomUUID(),
	otherId = randomUUID(),
	geoId = randomUUID(),
	legacyId = randomUUID(),
	variantId = randomUUID(),
	rateId = randomUUID(),
	bookingId = randomUUID()
let allowed = true,
	signedIn = true
vi.mock("@/lib/auth/providerSessionSurface", () => ({
	getProviderSessionSurfaceFromRequest: async () =>
		signedIn ? { providerId, userId: actorId, permissions: { canEditProfile: allowed } } : null,
}))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => (signedIn ? { email: "fixture@example.test" } : null),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => (signedIn ? providerId : null),
}))
vi.mock("@/lib/cache/invalidation", () => ({
	invalidateProduct: vi.fn(),
	invalidateProvider: vi.fn(),
}))
vi.mock("@/lib/product/productOperationalSurface", () => ({
	refreshProductOperationalSurfaceAfterMutation: vi.fn(),
}))
const { POST } = await import("@/pages/api/product/tour-presentation")
const { POST: formatPost } = await import("@/pages/api/product/experience-format")
const { POST: oldCategoryPost } = await import("@/pages/api/catalog/product-categories")
const { POST: businessPost } = await import("@/pages/api/provider/settings/experience-business")
const read = new CatalogReadModelRepository()
beforeAll(async () => {
	await db.insert(User).values({ id: actorId, email: `${actorId}@activity.test` })
	await db
		.insert(Provider)
		.values({ id: providerId, accountPurpose: "commercial", dataClassification: "production" })
	await db.insert(GeoPlace).values({
		id: geoId,
		canonicalName: "Ciudad",
		normalizedName: geoId,
		slug: geoId,
		canonicalPath: `/bolivia/${geoId}`,
		placeType: "city",
		countryCode: "BO",
	})
	await db.insert(ProductCategory).values({
		id: legacyId,
		slug: `historic-${legacyId.replaceAll("-", "").replace(/[0-9a-f]/g, (c) => String.fromCharCode(103 + parseInt(c, 16)))}`,
		name: "Categoría histórica",
		vertical: "tour",
	})
	await db.insert(Product).values([
		{
			id: productId,
			providerId,
			name: "Experiencia",
			productType: "tour",
			dataClass: "production",
		},
		{ id: otherId, providerId, name: "Hotel", productType: "hotel", dataClass: "fixture" },
	])
	await db.insert(Tour).values({
		productId,
		experienceFormat: "workshop",
		itineraryJson: [{ description: "Crear una pieza" }],
		durationMinutes: 60,
		meetingPointJson: { address: "Estudio" },
		includesJson: ["Materiales"],
	})
	await db.insert(ProductCategoryLink).values({ id: randomUUID(), productId, categoryId: legacyId })
	await db
		.insert(ProviderCommercialLine)
		.values({ id: randomUUID(), providerId, line: "tour", source: "product" })
	await db.insert(Variant).values({ id: variantId, productId, kind: "tour_slot", name: "Mañana" })
	await db.insert(RatePlan).values({ id: rateId, variantId, name: "General" })
	await db.insert(DailyInventory).values({
		id: randomUUID(),
		variantId,
		date: "2027-04-12",
		totalInventory: 8,
		reservedCount: 3,
	})
	await db.insert(Booking).values({
		id: bookingId,
		providerId,
		ratePlanId: rateId,
		checkInDate: "2027-04-12",
		checkOutDate: "2027-04-13",
		totalAmount: 50,
		currency: "BOB",
		guestExpectationsSnapshotJson: { historical: true },
	})
})
afterAll(async () => {
	await db.delete(Booking).where(eq(Booking.id, bookingId))
	await db.delete(DailyInventory).where(eq(DailyInventory.variantId, variantId))
	await db.delete(RatePlan).where(eq(RatePlan.id, rateId))
	await db.delete(Variant).where(eq(Variant.id, variantId))
	await db.delete(ProductCategoryLink).where(eq(ProductCategoryLink.productId, productId))
	await db.delete(ProductContent).where(eq(ProductContent.productId, productId))
	await db.delete(ProductGeoPlaceActivity).where(eq(ProductGeoPlaceActivity.productId, productId))
	await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, productId))
	await db.delete(Tour).where(eq(Tour.productId, productId))
	await db.delete(ProviderAuditLog).where(eq(ProviderAuditLog.providerId, providerId))
	await db.delete(ProviderCommercialLine).where(eq(ProviderCommercialLine.providerId, providerId))
	await db.delete(Product).where(inArray(Product.id, [productId, otherId]))
	await db.delete(ProductCategory).where(eq(ProductCategory.id, legacyId))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, geoId))
	await db.delete(Provider).where(eq(Provider.id, providerId))
	await db.delete(User).where(eq(User.id, actorId))
})
async function protectedRows() {
	return Promise.all([
		db.select().from(DailyInventory).where(eq(DailyInventory.variantId, variantId)),
		db.select().from(Booking).where(eq(Booking.id, bookingId)),
		db.select().from(Variant).where(eq(Variant.id, variantId)),
		db.select().from(RatePlan).where(eq(RatePlan.id, rateId)),
	])
}
async function revision() {
	return (await db.select().from(Tour).where(eq(Tour.productId, productId)))[0]
		.classificationRevision
}
async function send(overrides: Record<string, string> = {}, modern = true) {
	const fd = new FormData()
	for (const [key, value] of Object.entries({
		productId,
		mode: "edit",
		name: "Crea una taza",
		geoPlaceId: geoId,
		description: "Actividad creativa",
		highlights: "Tu propia pieza",
		experienceFormat: "workshop",
		...(modern
			? {
					classificationPayloadVersion: "1",
					expectedClassificationRevision: String(await revision()),
					primaryActivityCategoryId: "exp:activity:ceramics",
				}
			: { categoryId: legacyId }),
		...overrides,
	}))
		fd.set(key, value)
	return POST({
		request: new Request("http://fastt.test/api/product/tour-presentation", {
			method: "POST",
			body: fd,
		}),
	} as never)
}
it("saves through the real route, keeps legacy links and protected rows, and shares readiness", async () => {
	const before = await protectedRows()
	expect((await send()).status).toBe(200)
	const aggregate = await read.getProductFullAggregate(productId, providerId)
	expect(aggregate?.subtype).toMatchObject({
		experienceFormat: "workshop",
		primaryActivityCategoryId: "exp:activity:ceramics",
		activityContractVersion: 1,
	})
	expect(evaluateTourContentReadiness(aggregate!, { hasCategory: false }).activities).toBe(true)
	expect(await protectedRows()).toEqual(before)
	expect(
		await db.select().from(ProductCategoryLink).where(eq(ProductCategoryLink.productId, productId))
	).toEqual([expect.objectContaining({ categoryId: legacyId, assignmentKind: "legacy" })])
	const matching = await db
		.select({ id: Product.id })
		.from(Product)
		.where(experienceCategoryFilter(sql`${Product.id}`, ["experience-arts"]))
	expect(matching.map((row) => row.id)).toContain(productId)
})
it("retries without changing revision or duplicating an activity audit", async () => {
	const current = await revision(),
		audits = await db
			.select()
			.from(ProviderAuditLog)
			.where(eq(ProviderAuditLog.entityId, productId))
	expect((await send({ expectedClassificationRevision: "0" })).status).toBe(200)
	expect(await revision()).toBe(current)
	expect(
		await db.select().from(ProviderAuditLog).where(eq(ProviderAuditLog.entityId, productId))
	).toEqual(audits)
})
it("rejects stale selection and invalid activity without writes", async () => {
	const before = await db.select().from(Tour).where(eq(Tour.productId, productId))
	expect(
		(
			await send({
				primaryActivityCategoryId: "exp:activity:coffee",
				expectedClassificationRevision: "0",
			})
		).status
	).toBe(409)
	expect((await send({ primaryActivityCategoryId: "exp:family:arts" })).status).toBe(400)
	expect((await send({ primaryActivityCategoryId: "missing" })).status).toBe(400)
	expect((await send({ productId: otherId })).status).toBe(404)
	expect(await db.select().from(Tour).where(eq(Tour.productId, productId))).toEqual(before)
})
it("old payloads cannot erase a modern selection", async () => {
	const before = await db.select().from(Tour).where(eq(Tour.productId, productId))
	expect((await send({}, false)).status).toBe(200)
	expect(await db.select().from(Tour).where(eq(Tour.productId, productId))).toEqual(before)
})
it("guards direct SQL hierarchy, cross-vertical selection and contract downgrade", async () => {
	await expect(
		db
			.update(Tour)
			.set({ primaryActivityCategoryId: legacyId })
			.where(eq(Tour.productId, productId))
	).rejects.toThrow(/primary_activity_invalid/)
	await expect(
		db.update(Tour).set({ activityContractVersion: 0 }).where(eq(Tour.productId, productId))
	).rejects.toThrow(/downgrade/)
	await expect(
		db.insert(ProductCategory).values({
			id: randomUUID(),
			slug: "cycle-impossible",
			name: "Invalid",
			vertical: "tour",
			classificationKind: "activity",
			parentCategoryId: "exp:activity:ceramics",
		})
	).rejects.toThrow(/activity_parent_invalid/)
})
it("rejects unauthenticated and read-only requests", async () => {
	allowed = false
	expect((await send()).status).toBe(403)
	allowed = true
	signedIn = false
	expect((await send()).status).toBe(401)
	signedIn = true
})
it("keeps descriptive business kinds independent from selection and inventory", async () => {
	const before = await protectedRows(),
		selection = await db.select().from(Tour).where(eq(Tour.productId, productId))
	await saveExperienceBusinessKinds({ providerId, actorId, kinds: ["creative_studio", "school"] })
	expect(
		(
			await db
				.select()
				.from(ProviderCommercialLine)
				.where(eq(ProviderCommercialLine.providerId, providerId))
		)[0].businessKinds
	).toEqual(["creative_studio", "school"])
	expect(await protectedRows()).toEqual(before)
	expect(await db.select().from(Tour).where(eq(Tour.productId, productId))).toEqual(selection)
})
it("format changes use the same classification revision", async () => {
	const expected = await revision()
	const invoke = (format: string, rev: number) =>
		formatPost({
			request: new Request("http://fastt.test/api/product/experience-format", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					productId,
					experienceFormat: format,
					expectedClassificationRevision: rev,
				}),
			}),
		} as never)
	expect((await invoke("class", expected)).status).toBe(200)
	expect(await revision()).toBe(expected + 1)
	expect((await invoke("tasting", expected)).status).toBe(409)
})

it("serializes theme edits, preserves identical links, and rejects stale competing changes", async () => {
	const before = await protectedRows(),
		oldRevision = await revision()
	const responses = await Promise.all([
		send({
			additionalThemeId: "exp:family:food",
			expectedClassificationRevision: String(oldRevision),
			experienceFormat: "class",
		}),
		send({
			additionalThemeId: "exp:family:science",
			expectedClassificationRevision: String(oldRevision),
			experienceFormat: "class",
		}),
	])
	expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
	const rows = await db
		.select()
		.from(ProductCategoryLink)
		.where(eq(ProductCategoryLink.productId, productId))
	const theme = rows.find((r) => r.assignmentKind === "additional_theme")!
	expect(await revision()).toBeGreaterThan(oldRevision)
	const same = await send({ additionalThemeId: theme.categoryId, experienceFormat: "class" })
	expect(same.status).toBe(200)
	expect(
		await db.select().from(ProductCategoryLink).where(eq(ProductCategoryLink.productId, productId))
	).toEqual(rows)
	expect(await protectedRows()).toEqual(before)
})

it("rejects the old category writer without removing modern or historical links", async () => {
	const before = await db
		.select()
		.from(ProductCategoryLink)
		.where(eq(ProductCategoryLink.productId, productId))
	const response = await oldCategoryPost({
		request: new Request("http://fastt.test/api/catalog/product-categories", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ productId, categoryIds: [] }),
		}),
	} as never)
	expect(response.status).toBe(409)
	expect(
		await db.select().from(ProductCategoryLink).where(eq(ProductCategoryLink.productId, productId))
	).toEqual(before)
})
it("validates business classification through its authenticated route", async () => {
	const request = (kind: string) => {
		const body = new FormData()
		body.set("businessKind", kind)
		return {
			request: new Request("http://fastt.test/api/provider/settings/experience-business", {
				method: "POST",
				body,
			}),
		} as never
	}
	const before = await protectedRows()
	expect((await businessPost(request("creative_studio"))).status).toBe(200)
	expect((await businessPost(request("toString"))).status).toBe(400)
	allowed = false
	expect((await businessPost(request("school"))).status).toBe(403)
	allowed = true
	expect(await protectedRows()).toEqual(before)
})
