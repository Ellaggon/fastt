import { describe, it, expect } from "vitest"

import { db, Booking } from "astro:db"

import {
	createPolicyCapa6,
	createPolicyVersionCapa6,
	replacePolicyAssignmentCapa6,
} from "@/modules/policies/public"
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
			kind: "hotel_room",
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
			providerId: "prov_test",
			userId: null,
			ratePlanId,
			checkInDate: "2026-03-10",
			checkOutDate: "2026-03-11",
			numAdults: 2,
			numChildren: 0,
			totalAmount: 0,
			currency: "USD",
			status: "confirmed",
			source: "web",
		} as any)

		const p1 = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "CheckIn",
			description: "Llegada entre 14:00 y 22:00",
			rules: { checkInFrom: "14:00", checkInUntil: "22:00", checkOutUntil: "11:00" },
		})
		const p2 = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Payment",
			description: "Pay now",
			rules: { paymentType: "pay_at_property" },
		})
		await replacePolicyAssignmentCapa6({
			policyId: p1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})
		await replacePolicyAssignmentCapa6({
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
		expect(cats).toEqual(["CheckIn", "Payment"])
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
			kind: "hotel_room",
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
			providerId: "prov_test",
			userId: null,
			ratePlanId,
			checkInDate: "2026-03-10",
			checkOutDate: "2026-03-11",
			numAdults: 2,
			numChildren: 0,
			totalAmount: 0,
			currency: "USD",
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
			kind: "hotel_room",
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
			providerId: "prov_test",
			userId: null,
			ratePlanId,
			checkInDate: "2026-03-10",
			checkOutDate: "2026-03-11",
			numAdults: 2,
			numChildren: 0,
			totalAmount: 0,
			currency: "USD",
			status: "confirmed",
			source: "web",
		} as any)

		const created = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Payment",
			description: "Pago inicial",
			rules: { paymentType: "pay_at_property" },
		})
		await replacePolicyAssignmentCapa6({
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
		const beforePayment = before.policies.find((p) => p.category === "Payment")?.policy as any
		expect(beforePayment?.policy?.description).toBe("Pago inicial")

		await createPolicyVersionCapa6({
			previousPolicyId: created.policyId,
			description: "Pago modificado",
			rules: { paymentType: "prepaid" },
		})

		const after = await getPoliciesForBookingUseCase(bookingId)
		const afterPayment = after.policies.find((p) => p.category === "Payment")?.policy as any
		expect(afterPayment?.policy?.description).toBe("Pago inicial")
	})
})
