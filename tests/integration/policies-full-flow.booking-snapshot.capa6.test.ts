import { describe, it, expect } from "vitest"

import {
	assignPolicyCapa6,
	createPolicyCapa6,
	createPolicyVersionCapa6,
	resolveEffectivePolicies,
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

describe("integration/policies CAPA 6 Step 9 (full flow + booking snapshot immutability)", () => {
	it("create→assign→resolve→snapshot→read; new version changes resolver but NOT booking snapshot", async () => {
		const destinationId = `dest_pol9_${crypto.randomUUID()}`
		const productId = `prod_pol9_${crypto.randomUUID()}`
		const variantId = `var_pol9_${crypto.randomUUID()}`
		const bookingId = `book_pol9_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Policy Destination",
			type: "city",
			country: "CL",
			slug: `policy-destination-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "Policy Product",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({
			id: variantId,
			productId,
			entityType: "hotel_room",
			entityId: `room_${crypto.randomUUID()}`,
			name: "Room 1",
		})

		const rptId = `rpt_pol9_${crypto.randomUUID()}`
		const ratePlanId = `rp_pol9_${crypto.randomUUID()}`
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

		// 1) Create policies for all booking-level categories.
		const cancellation = await createPolicyCapa6({
			category: "Cancellation",
			description: "Flexible cancellation",
			cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
		} as any)
		const payment = await createPolicyCapa6({
			category: "Payment",
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
		} as any)
		const checkIn = await createPolicyCapa6({
			category: "CheckIn",
			description: "Standard check-in",
			rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
		} as any)
		const noShow = await createPolicyCapa6({
			category: "NoShow",
			description: "No-show first night",
			rules: { penaltyType: "first_night" },
		} as any)

		// 2) Assign to rate plan.
		for (const p of [cancellation, payment, checkIn, noShow]) {
			await assignPolicyCapa6({
				policyId: p.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
				channel: null,
			})
		}

		// 3) Verify resolution.
		const resolved = await resolveEffectivePolicies({ productId, variantId, ratePlanId })
		const byCat = new Map(resolved.policies.map((p) => [p.category, p]))
		for (const c of ["Cancellation", "Payment", "CheckIn", "NoShow"]) {
			expect(byCat.has(c)).toBe(true)
			expect(byCat.get(c)?.resolvedFromScope).toBe("rate_plan")
			expect(byCat.get(c)?.policy.version).toBe(1)
		}

		// 4-6) Snapshot at booking time and read from snapshot.
		await snapshotPoliciesForBookingUseCase({
			bookingId,
			productId,
			variantId,
			ratePlanId,
			channel: null,
		})
		const snap1 = await getPoliciesForBookingUseCase(bookingId)
		expect(snap1.policies).toHaveLength(4)

		const snapPayment = snap1.policies.find((p) => p.category === "Payment")?.policy as any
		expect(snapPayment?.policy?.id).toBe(payment.policyId)
		expect(snapPayment?.policy?.version).toBe(1)

		// 7) Modify policy (create new version) and ensure resolver switches.
		await createPolicyVersionCapa6({
			previousPolicyId: payment.policyId,
			description: "Prepayment required",
			rules: {
				paymentType: "prepayment",
				prepaymentPercentage: 20,
				prepaymentDaysBeforeArrival: null,
			},
		} as any)

		const resolved2 = await resolveEffectivePolicies({ productId, variantId, ratePlanId })
		const pay2 = resolved2.policies.find((p) => p.category === "Payment")
		expect(pay2?.policy.version).toBe(2)
		expect(pay2?.policy.description).toBe("Prepayment required")

		// 8) Booking snapshot must remain immutable.
		const snap2 = await getPoliciesForBookingUseCase(bookingId)
		const snapPayment2 = snap2.policies.find((p) => p.category === "Payment")?.policy as any
		expect(snapPayment2?.policy?.id).toBe(payment.policyId)
		expect(snapPayment2?.policy?.version).toBe(1)
		expect(snapPayment2?.policy?.description).toBe("Pay at property")
	})
})
