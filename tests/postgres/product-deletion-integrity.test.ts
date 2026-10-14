import { afterEach, describe, expect, it, vi } from "vitest"
import {
	db,
	eq,
	Product,
	ProductContent,
	Tour,
	TourTicketType,
	TourBookingQuestion,
	ProductReview,
	MarketplaceEvent,
	Variant,
	TourSlotProfile,
	RatePlan,
	Booking,
	TourPrivateRequest,
} from "@/shared/infrastructure/db/compat"
import { ProductRepository } from "@/modules/catalog/infrastructure/repositories/ProductRepository"
import { upsertProvider } from "../test-support/catalog-db-test-data"

const auth = vi.hoisted(() => ({ providerId: "" }))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => auth.providerId,
}))
vi.mock("@/container", () => ({ productRepository: new ProductRepository() }))
import { POST } from "@/pages/api/products/[id]/delete"

const ids: string[] = []
async function fixture() {
	const suffix = crypto.randomUUID()
	const id = `delete-tour-${suffix}`
	auth.providerId = `delete-owner-${suffix}`
	await upsertProvider({
		id: auth.providerId,
		displayName: "Deletion fixture",
		ownerEmail: `${suffix}@example.com`,
	})
	await db
		.insert(Product)
		.values({ id, name: "Deletion fixture", productType: "Tour", providerId: auth.providerId })
	ids.push(id)
	await db.insert(Tour).values({ productId: id })
	await db.insert(ProductContent).values({ productId: id, description: "Must survive rollback" })
	await db
		.insert(TourTicketType)
		.values({ id: `ticket-${id}`, productId: id, code: "adult", label: "Adulto" })
	await db
		.insert(TourBookingQuestion)
		.values({ id: `question-${id}`, productId: id, code: "note", label: "Notas" })
	await db
		.insert(Variant)
		.values({ id: `variant-${id}`, productId: id, name: "Option", kind: "tour_slot" })
	await db
		.insert(TourSlotProfile)
		.values({ variantId: `variant-${id}`, departureTime: "09:00", maxPax: 10, languageCode: "es" })
	await db.insert(RatePlan).values({ id: `rate-${id}`, variantId: `variant-${id}`, name: "Rate" })
	return id
}
async function remove(id: string, bodyId = id) {
	return POST({
		params: { id },
		request: new Request(`http://localhost/api/products/${id}/delete`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ productId: bodyId }),
		}),
	} as any)
}
afterEach(async () => {
	for (const id of ids.splice(0)) {
		await db.delete(Booking).where(eq(Booking.ratePlanId, `rate-${id}`))
		await db.delete(TourPrivateRequest).where(eq(TourPrivateRequest.productId, id))
		await db.delete(MarketplaceEvent).where(eq(MarketplaceEvent.targetProductId, id))
		await db.delete(ProductReview).where(eq(ProductReview.productId, id))
		await new ProductRepository().deleteProductCascade(id)
	}
}, 30_000)
describe("product deletion through the real endpoint", () => {
	it("removes participant types and questions together with an unused tour", async () => {
		const id = await fixture()
		expect((await remove(id)).status).toBe(200)
		expect(await db.select().from(Product).where(eq(Product.id, id))).toHaveLength(0)
		expect(
			await db.select().from(TourTicketType).where(eq(TourTicketType.productId, id))
		).toHaveLength(0)
		expect(
			await db.select().from(TourBookingQuestion).where(eq(TourBookingQuestion.productId, id))
		).toHaveLength(0)
	})
	it("rolls back earlier deletions when a protected reference rejects the final delete", async () => {
		const id = await fixture()
		await db
			.insert(MarketplaceEvent)
			.values({ id: `event-${id}`, eventType: "click", surface: "test", targetProductId: id })
		const before = await db.select().from(ProductContent).where(eq(ProductContent.productId, id))
		const response = await remove(id)
		expect(response.status).toBe(409)
		expect(await response.json()).toMatchObject({ code: "linked_history" })
		expect(await db.select().from(ProductContent).where(eq(ProductContent.productId, id))).toEqual(
			before
		)
		expect(
			await db.select().from(TourTicketType).where(eq(TourTicketType.productId, id))
		).toHaveLength(1)
		expect(await db.select().from(Tour).where(eq(Tour.productId, id))).toHaveLength(1)
		expect(
			await db
				.select()
				.from(RatePlan)
				.where(eq(RatePlan.id, `rate-${id}`))
		).toHaveLength(1)
		expect(
			await db
				.select()
				.from(TourSlotProfile)
				.where(eq(TourSlotProfile.variantId, `variant-${id}`))
		).toHaveLength(1)
		await db.delete(MarketplaceEvent).where(eq(MarketplaceEvent.targetProductId, id))
		expect((await remove(id)).status).toBe(200)
	})
	it("preserves cancelled reservations and private requests", async () => {
		const id = await fixture()
		await db
			.insert(Booking)
			.values({
				id: `booking-${id}`,
				providerId: auth.providerId,
				ratePlanId: `rate-${id}`,
				checkInDate: "2026-10-20",
				checkOutDate: "2026-10-21",
				totalAmount: 100,
				currency: "BOB",
				status: "cancelled",
			})
		expect((await remove(id)).status).toBe(409)
		expect(
			await db
				.select()
				.from(Booking)
				.where(eq(Booking.id, `booking-${id}`))
		).toHaveLength(1)
		await db.delete(Booking).where(eq(Booking.id, `booking-${id}`))
		await db
			.insert(TourPrivateRequest)
			.values({
				id: `request-${id}`,
				productId: id,
				variantId: `variant-${id}`,
				providerId: auth.providerId,
				departureDate: "2026-10-20",
				partyJson: { adults: 2 },
				contactName: "Test",
				contactEmail: "test@example.com",
			})
		expect((await remove(id)).status).toBe(409)
		expect(
			await db.select().from(TourPrivateRequest).where(eq(TourPrivateRequest.productId, id))
		).toHaveLength(1)
	})

	it("rejects history and foreign ownership without changing content", async () => {
		const id = await fixture()
		await db.insert(ProductReview).values({ id: `review-${id}`, productId: id, rating: 5 })
		expect((await remove(id)).status).toBe(409)
		auth.providerId = "another-owner"
		expect((await remove(id)).status).toBe(403)
		expect((await remove(id, "another-product")).status).toBe(400)
		expect(
			await db.select().from(ProductContent).where(eq(ProductContent.productId, id))
		).toHaveLength(1)
	})
})
