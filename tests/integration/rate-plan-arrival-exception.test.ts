import {
	and,
	db,
	eq,
	isNull,
	PolicyAssignment,
	User,
} from "@/shared/infrastructure/db/compat"
import { describe, expect, it } from "vitest"

import {
	getRatePlanArrivalContext,
	listRatePlansWithArrivalException,
	removeRatePlanArrivalException,
	upsertRatePlanArrivalException,
} from "@/lib/policies/ratePlanArrivalException"
import { syncHotelArrivalPolicy } from "@/lib/policies/syncHotelArrivalPolicy"
import type { HouseRule } from "@/modules/house-rules/public"
import {
	upsertGeoPlace,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"
import { upsertProvider } from "../test-support/catalog-db-test-data"

function hotelArrivalRules(productId: string): HouseRule[] {
	return [
		{
			id: crypto.randomUUID(),
			productId,
			scope: "product",
			scopeId: null,
			type: "CheckIn",
			payloadJson: {
				kind: "CheckIn",
				method: "front_desk",
				checkInFrom: "15:00",
				checkInUntil: "22:00",
			},
			createdAt: new Date().toISOString(),
		},
		{
			id: crypto.randomUUID(),
			productId,
			scope: "product",
			scopeId: null,
			type: "Checkout",
			payloadJson: { kind: "Checkout", time: "11:00" },
			createdAt: new Date().toISOString(),
		},
	]
}

describe("integration/rate-plan arrival exception", () => {
	it("writes CheckIn PolicyAssignment at rate_plan and lists only that exception", async () => {
		const suffix = crypto.randomUUID()
		const providerId = `provider_rate_arrival_${suffix}`
		const geoPlaceId = `destination_rate_arrival_${suffix}`
		const productId = `product_rate_arrival_${suffix}`
		const variantId = `variant_rate_arrival_${suffix}`
		const templateId = `template_rate_arrival_${suffix}`
		const ratePlanId = `rate_arrival_${suffix}`
		const otherRatePlanId = `rate_arrival_other_${suffix}`
		const actorUserId = `user_rate_arrival_${suffix}`

		await db
			.insert(User)
			.values({
				id: actorUserId,
				email: `rate-arrival-actor-${suffix}@example.com`,
			})
			.onConflictDoNothing()
		await upsertProvider({
			id: providerId,
			displayName: "Rate arrival provider",
			ownerEmail: `rate-arrival-${suffix}@example.com`,
		})
		await upsertGeoPlace({
			id: geoPlaceId,
			name: "Rate arrival destination",
			type: "city",
			country: "BO",
			slug: `rate-arrival-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Rate arrival hotel",
			productType: "Hotel",
			geoPlaceId,
			providerId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			kind: "hotel_room",
			name: "Suite",
		})
		await upsertRatePlanTemplate({
			id: templateId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: true,
		})
		await upsertRatePlan({
			id: otherRatePlanId,
			templateId,
			variantId,
			isActive: true,
			isDefault: false,
		})

		await syncHotelArrivalPolicy({
			providerId,
			productId,
			actorUserId,
			rules: hotelArrivalRules(productId),
		})

		expect(await listRatePlansWithArrivalException(productId)).toEqual([])

		await upsertRatePlanArrivalException({
			providerId,
			ratePlanId,
			actorUserId,
			schedule: {
				checkInFrom: "14:00",
				checkInUntil: "23:00",
				checkOutUntil: "12:00",
			},
		})

		const listed = await listRatePlansWithArrivalException(productId)
		expect(listed.map((item) => item.ratePlanId)).toEqual([ratePlanId])
		expect(listed[0]?.schedule).toEqual({
			checkInFrom: "14:00",
			checkInUntil: "23:00",
			checkOutUntil: "12:00",
		})

		const context = await getRatePlanArrivalContext({ productId, ratePlanId })
		expect(context?.hasException).toBe(true)
		expect(context?.hotelSchedule).toEqual({
			checkInFrom: "15:00",
			checkInUntil: "22:00",
			checkOutUntil: "11:00",
		})
		expect(context?.rateSchedule).toEqual({
			checkInFrom: "14:00",
			checkInUntil: "23:00",
			checkOutUntil: "12:00",
		})

		const assignment = await db
			.select({ id: PolicyAssignment.id })
			.from(PolicyAssignment)
			.where(
				and(
					eq(PolicyAssignment.scope, "rate_plan"),
					eq(PolicyAssignment.scopeId, ratePlanId),
					eq(PolicyAssignment.category, "CheckIn"),
					eq(PolicyAssignment.isActive, true),
					isNull(PolicyAssignment.channel)
				)
			)
			.then((rows) => rows[0])
		expect(assignment?.id).toBeTruthy()

		await removeRatePlanArrivalException({
			providerId,
			ratePlanId,
			actorUserId,
		})
		expect(await listRatePlansWithArrivalException(productId)).toEqual([])
		const after = await getRatePlanArrivalContext({ productId, ratePlanId })
		expect(after?.hasException).toBe(false)
	})
})
