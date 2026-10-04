import { describe, it, expect } from "vitest"
import { db, TourPrivateRequest, eq, inArray } from "@/shared/infrastructure/db/compat"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import {
	listTourPrivateRequests,
	findTourPrivateRequest,
	countPendingTourPrivateRequests,
} from "@/modules/catalog/infrastructure/repositories/TourPrivateRequestQueryRepository"
import { TourTrustRepository } from "@/modules/catalog/infrastructure/repositories/TourTrustRepository"
import { transitionTourPrivateRequest } from "@/modules/catalog/application/use-cases/transition-tour-private-request"

describe("Private request inbox persistence", () => {
	it("aggregates all tours, keeps old pending visible, paginates and isolates ownership", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `inbox_${suffix}`
		const other = `other_${suffix}`
		const geo = `geo_${suffix}`
		const p1 = `p1_${suffix}`
		const p2 = `p2_${suffix}`
		const p3 = `p3_${suffix}`
		await upsertGeoPlace({
			id: geo,
			name: "La Paz",
			type: "city",
			country: "BO",
			slug: `la-paz-${suffix}`,
		})
		for (const [id, owner] of [
			[p1, providerId],
			[p2, providerId],
			[p3, other],
		]) {
			await upsertProduct({ id, name: id, productType: "Tour", geoPlaceId: geo, providerId: owner })
			await upsertVariant({ id: `v_${id}`, productId: id, name: "Privada" })
		}
		const make = (
			id: string,
			productId: string,
			owner: string,
			status: string,
			createdAt: Date
		) => ({
			id,
			productId,
			variantId: `v_${productId}`,
			providerId: owner,
			departureDate: "2999-01-01",
			partyJson: { adults: 2, children: 1, infants: 0 },
			contactName: "Test",
			contactEmail: "test@example.com",
			status,
			createdAt,
			slaDueAt: new Date("2020-01-02"),
		})
		const rows = [
			make(`old_${suffix}`, p1, providerId, "pending", new Date("2020-01-01")),
			make(`second_${suffix}`, p2, providerId, "pending", new Date("2020-01-02")),
			make(`foreign_${suffix}`, p3, other, "pending", new Date()),
			...Array.from({ length: 55 }, (_, i) =>
				make(`done_${suffix}_${i}`, p1, providerId, "accepted", new Date())
			),
		]
		await db.insert(TourPrivateRequest).values(rows)
		try {
			const page = await listTourPrivateRequests(providerId, {
				status: "pending",
				page: 1,
				pageSize: 1,
			})
			expect(page.total).toBe(2)
			expect(page.pendingCount).toBe(2)
			expect(page.items[0].request.id).toBe(`old_${suffix}`)
			const next = await listTourPrivateRequests(providerId, {
				status: "pending",
				page: 2,
				pageSize: 1,
			})
			expect(next.items[0].request.productId).toBe(p2)
			expect(await countPendingTourPrivateRequests(providerId)).toBe(2)
			expect(await countPendingTourPrivateRequests(providerId, p1)).toBe(1)
			expect(await countPendingTourPrivateRequests(providerId, p2)).toBe(1)
			expect(
				(
					await listTourPrivateRequests(providerId, {
						status: "all",
						productId: p1,
						page: 1,
						pageSize: 20,
					})
				).total
			).toBe(56)
			expect(await findTourPrivateRequest(providerId, `foreign_${suffix}`)).toBeNull()
			expect(
				(
					await listTourPrivateRequests(providerId, {
						status: "all",
						productId: p3,
						page: 1,
						pageSize: 20,
					})
				).total
			).toBe(0)
		} finally {
			await db.delete(TourPrivateRequest).where(
				inArray(
					TourPrivateRequest.id,
					rows.map((r) => r.id)
				)
			)
		}
	})
	it("preserves the first concurrent decision and makes response-loss retry idempotent", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `concurrent_${suffix}`
		const productId = `p_${suffix}`
		const geo = `g_${suffix}`
		const id = `r_${suffix}`
		await upsertGeoPlace({
			id: geo,
			name: "La Paz",
			type: "city",
			country: "BO",
			slug: `la-paz-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Tour",
			productType: "Tour",
			geoPlaceId: geo,
			providerId,
		})
		await upsertVariant({ id: `v_${suffix}`, productId, name: "Privada" })
		await db.insert(TourPrivateRequest).values({
			id,
			providerId,
			productId,
			variantId: `v_${suffix}`,
			departureDate: "2999-01-01",
			partyJson: { adults: 2 },
			contactName: "Test",
			contactEmail: "test@example.com",
		})
		const repo = new TourTrustRepository()
		try {
			const results = await Promise.all([
				transitionTourPrivateRequest(
					{ repo },
					{ providerId, requestId: id, status: "accepted", providerNote: "accept" }
				),
				transitionTourPrivateRequest(
					{ repo },
					{ providerId, requestId: id, status: "declined", providerNote: "decline" }
				),
			])
			expect(results.filter((r) => r.ok)).toHaveLength(1)
			expect(results.filter((r) => !r.ok)).toHaveLength(1)
			const [persisted] = await db
				.select()
				.from(TourPrivateRequest)
				.where(eq(TourPrivateRequest.id, id))
			const status = persisted.status as "accepted" | "declined"
			expect(
				await transitionTourPrivateRequest(
					{ repo },
					{ providerId, requestId: id, status, providerNote: "overwrite" }
				)
			).toMatchObject({ ok: true, idempotent: true })
			const [retried] = await db
				.select()
				.from(TourPrivateRequest)
				.where(eq(TourPrivateRequest.id, id))
			expect(retried.providerNote).toBe(persisted.providerNote)
			expect(
				await transitionTourPrivateRequest(
					{ repo },
					{ providerId: "foreign", requestId: id, status }
				)
			).toMatchObject({ ok: false, error: "not_found" })
		} finally {
			await db.delete(TourPrivateRequest).where(eq(TourPrivateRequest.id, id))
		}
	})
})
