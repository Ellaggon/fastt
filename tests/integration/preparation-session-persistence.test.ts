import { beforeEach, afterEach, describe, it, expect, vi } from "vitest"
import {
	db,
	eq,
	ProviderPreparationSession,
	Provider,
	Product,
	User,
	Variant,
	RatePlan,
	VariantCapacity,
	GeoPlace,
	ProductGeoPlace,
} from "@/shared/infrastructure/db/compat"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"
import { savePreparationSession } from "@/lib/onboarding/preparationSession"
const auth = vi.hoisted(() => ({ userId: "", providerId: "" }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: auth.userId }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => auth.providerId,
}))
import { POST } from "@/pages/api/onboarding/preparation-session"
let a: string, b: string, va: string, vb: string, ra: string, rb: string, place: string
beforeEach(async () => {
	const suffix = crypto.randomUUID()
	auth.providerId = `sessions-provider-${suffix}`
	auth.userId = `sessions-user-${suffix}`
	a = `sessions-a-${suffix}`
	b = `sessions-b-${suffix}`
	va = `sessions-va-${suffix}`
	vb = `sessions-vb-${suffix}`
	ra = `sessions-ra-${suffix}`
	rb = `sessions-rb-${suffix}`
	place = `sessions-place-${suffix}`
	await upsertGeoPlace({
		id: place,
		name: "Session fixture",
		type: "city",
		country: "BO",
		slug: `sessions-${suffix}`,
	})
	await upsertProvider({ id: auth.providerId, accountPurpose: "integration_certification" })
	await db.insert(User).values({ id: auth.userId, email: `${suffix}@example.test` })
	for (const [productId, variantId, ratePlanId] of [
		[a, va, ra],
		[b, vb, rb],
	]) {
		await upsertProduct({
			id: productId,
			name: "Session fixture",
			providerId: auth.providerId,
			productType: "tour",
			geoPlaceId: place,
			dataClass: "fixture",
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "tour_slot",
			name: "Option",
			maxOccupancy: 8,
		})
		await db.insert(RatePlan).values({ id: ratePlanId, variantId, name: "Rate" })
	}
})
afterEach(async () => {
	await db
		.delete(ProviderPreparationSession)
		.where(eq(ProviderPreparationSession.providerId, auth.providerId))
	for (const [productId, variantId] of [
		[a, va],
		[b, vb],
	]) {
		await db.delete(RatePlan).where(eq(RatePlan.variantId, variantId))
		await db.delete(VariantCapacity).where(eq(VariantCapacity.variantId, variantId))
		await db.delete(Variant).where(eq(Variant.id, variantId))
		await db.delete(ProductGeoPlace).where(eq(ProductGeoPlace.productId, productId))
		await db.delete(Product).where(eq(Product.id, productId))
	}
	await db.delete(User).where(eq(User.id, auth.userId))
	await db.delete(Provider).where(eq(Provider.id, auth.providerId))
	await db.delete(GeoPlace).where(eq(GeoPlace.id, place))
})
function input(productId = a, variantId: string | null = va, ratePlanId: string | null = ra) {
	return {
		providerId: auth.providerId,
		userId: auth.userId,
		productId,
		variantId,
		ratePlanId,
		vertical: "tour" as const,
		playbookId: "launch-tour" as const,
		stepId: "content",
		lastPath: `/product/${productId}/content`,
	}
}
async function rows() {
	return db
		.select()
		.from(ProviderPreparationSession)
		.where(eq(ProviderPreparationSession.providerId, auth.providerId))
}
async function request(body: object) {
	return POST({
		request: new Request("http://localhost/api/onboarding/preparation-session", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	} as Parameters<typeof POST>[0]) as Promise<Response>
}
describe("B4 PostgreSQL sessions", () => {
	it("retains two independent tours and atomically deduplicates concurrent initial writes", async () => {
		await Promise.all([
			savePreparationSession(input()),
			savePreparationSession(input()),
			savePreparationSession(input(b, vb, rb)),
		])
		expect((await rows()).map((row) => row.productId).sort()).toEqual([a, b].sort())
		await savePreparationSession({
			...input(a, null, null),
			stepId: "images",
			lastPath: `/product/${a}/images`,
		})
		const saved = (await rows()).find((row) => row.productId === a)!
		expect(saved.variantId).toBe(va)
		expect(saved.ratePlanId).toBe(ra)
		expect(saved.lastPath).toContain(`variantId=${va}`)
	})
	it("ignores a delayed pagehide without losing the newest step", async () => {
		const older = new Date(Date.now() - 1000)
		await savePreparationSession({ ...input(), stepId: "images", lastPath: `/product/${a}/images` })
		await savePreparationSession({ ...input(), navigationAt: older })
		expect((await rows())[0].stepId).toBe("images")
	})
	it("rejects foreign option/rate/path and obsolete direct API requests before persistence", async () => {
		for (const change of [
			{ variantId: vb, ratePlanId: rb },
			{ ratePlanId: rb },
			{ lastPath: `/product/${b}/content` },
			{ vertical: "hotel" },
		]) {
			const response = await request({
				...input(),
				writeVersion: 2,
				navigationAt: new Date().toISOString(),
				...change,
			})
			expect(response.status).toBe(400)
		}
		expect((await request(input())).status).toBe(409)
		expect(await rows()).toEqual([])
	})
	it("rejects an old writer that leaves the v2 field unchanged", async () => {
		await savePreparationSession(input())
		const saved = (await rows())[0]
		await expect(
			db
				.update(ProviderPreparationSession)
				.set({ stepId: "images" })
				.where(eq(ProviderPreparationSession.id, saved.id))
		).rejects.toThrow()
		expect((await rows())[0]).toEqual(saved)
	})

	it("preserves session identity and rejects legacy database writes", async () => {
		await savePreparationSession(input())
		const saved = (await rows())[0]
		await expect(
			db
				.update(ProviderPreparationSession)
				.set({ productId: b })
				.where(eq(ProviderPreparationSession.id, saved.id))
		).rejects.toThrow()
		await expect(
			db
				.update(ProviderPreparationSession)
				.set({ writeVersion: 1 })
				.where(eq(ProviderPreparationSession.id, saved.id))
		).rejects.toThrow()
		expect((await rows())[0]).toEqual(saved)
	})
})
