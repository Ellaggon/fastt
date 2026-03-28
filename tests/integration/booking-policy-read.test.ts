import { describe, it, expect } from "vitest"

import { db, Booking } from "astro:db"

import { createPolicyCapa6, assignPolicyCapa6 } from "@/modules/policies/public"
import { snapshotPoliciesForBookingUseCase } from "@/container/booking-policy-snapshot.container"
import { getPoliciesForBookingUseCase } from "@/container/booking-policy-read.container"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/booking policy read path (CAPA 6 Step 6)", () => {
	it("returns policies from snapshot only (multiple categories)", async () => {
		const destinationId = `dest_bpr_${crypto.randomUUID()}`
		const productId = `prod_bpr_${crypto.randomUUID()}`
		const variantId = `var_bpr_${crypto.randomUUID()}`
		const rptId = `rpt_bpr_${crypto.randomUUID()}`
		const ratePlanId = `rp_bpr_${crypto.randomUUID()}`
		const bookingId = `bk_bpr_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BPR Dest",
			type: "city",
			country: "CL",
			slug: "bpr-dest",
		})
		await upsertProduct({ id: productId, name: "BPR Product", productType: "Hotel", destinationId })
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: `room_${crypto.randomUUID()}`,
			name: "Room",
		})
		await upsertRatePlanTemplate({
			id: rptId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId: rptId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date("2026-03-10"),
			checkOutDate: new Date("2026-03-11"),
			numAdults: 2,
			numChildren: 0,
			status: "confirmed",
			source: "web",
		} as any)

		const p1 = await createPolicyCapa6({ category: "Other", description: "Terms" })
		const p2 = await createPolicyCapa6({ category: "Payment", description: "Pay now" })
		await assignPolicyCapa6({
			policyId: p1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})
		await assignPolicyCapa6({
			policyId: p2.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		await snapshotPoliciesForBookingUseCase({
			bookingId,
			productId,
			variantId,
			ratePlanId,
			channel: null,
		})

		const read = await getPoliciesForBookingUseCase(bookingId)
		const cats = read.policies.map((p) => p.category).sort()
		expect(cats).toEqual(["Other", "Payment"])
	})

	it("throws booking_policy_snapshot_missing when no snapshot exists", async () => {
		const destinationId = `dest_missing_${crypto.randomUUID()}`
		const productId = `prod_missing_${crypto.randomUUID()}`
		const variantId = `var_missing_${crypto.randomUUID()}`
		const rptId = `rpt_missing_${crypto.randomUUID()}`
		const ratePlanId = `rp_missing_${crypto.randomUUID()}`
		const bookingId = `bk_missing_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Missing Dest",
			type: "city",
			country: "CL",
			slug: "missing-dest",
		})
		await upsertProduct({
			id: productId,
			name: "Missing Product",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: `room_${crypto.randomUUID()}`,
			name: "Room",
		})
		await upsertRatePlanTemplate({
			id: rptId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId: rptId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date("2026-03-10"),
			checkOutDate: new Date("2026-03-11"),
			numAdults: 2,
			numChildren: 0,
			status: "confirmed",
			source: "web",
		} as any)

		await expect(getPoliciesForBookingUseCase(bookingId)).rejects.toMatchObject({
			code: "booking_policy_snapshot_missing",
		})
	})

	it("does not drift: later policy updates do not affect snapshot read", async () => {
		const destinationId = `dest_bprd_${crypto.randomUUID()}`
		const productId = `prod_bprd_${crypto.randomUUID()}`
		const variantId = `var_bprd_${crypto.randomUUID()}`
		const rptId = `rpt_bprd_${crypto.randomUUID()}`
		const ratePlanId = `rp_bprd_${crypto.randomUUID()}`
		const bookingId = `bk_bprd_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "BPRD Dest",
			type: "city",
			country: "CL",
			slug: "bprd-dest",
		})
		await upsertProduct({
			id: productId,
			name: "BPRD Product",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: `room_${crypto.randomUUID()}`,
			name: "Room",
		})
		await upsertRatePlanTemplate({
			id: rptId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId: rptId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		await db.insert(Booking).values({
			id: bookingId,
			userId: null,
			ratePlanId,
			checkInDate: new Date("2026-03-10"),
			checkOutDate: new Date("2026-03-11"),
			numAdults: 2,
			numChildren: 0,
			status: "confirmed",
			source: "web",
		} as any)

		const created = await createPolicyCapa6({
			category: "Other",
			description: "Initial terms",
			rules: { foo: "bar" },
		})
		await assignPolicyCapa6({
			policyId: created.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		await snapshotPoliciesForBookingUseCase({
			bookingId,
			productId,
			variantId,
			ratePlanId,
			channel: null,
		})

		const before = await getPoliciesForBookingUseCase(bookingId)
		const beforeOther = before.policies.find((p) => p.category === "Other")?.policy as any
		expect(beforeOther?.policy?.description).toBe("Initial terms")

		await createPolicyCapa6({
			previousPolicyId: created.policyId,
			category: "Other",
			description: "Changed terms",
			rules: { foo: "baz" },
		})

		const after = await getPoliciesForBookingUseCase(bookingId)
		const afterOther = after.policies.find((p) => p.category === "Other")?.policy as any
		expect(afterOther?.policy?.description).toBe("Initial terms")
	})
})
