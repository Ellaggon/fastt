import { describe, expect, it } from "vitest"

import {
	assignPolicyCapa6,
	createPolicyCapa6,
	replacePolicyAssignmentCapa6,
	PolicyValidationError,
} from "@/modules/policies/public"
import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe.skip("legacy/policies governance required categories", () => {
	it("legacy contract expected hard reject for missing required categories", async () => {
		const destinationId = `dest_legacy_gov_${crypto.randomUUID()}`
		const productId = `prod_legacy_gov_${crypto.randomUUID()}`
		const variantId = `var_legacy_gov_${crypto.randomUUID()}`
		const ratePlanTemplateId = `rpt_legacy_gov_${crypto.randomUUID()}`
		const ratePlanId = `rp_legacy_gov_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Legacy Gov Dest",
			type: "city",
			country: "CL",
			slug: `legacy-gov-dest-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "Legacy Gov Product",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({ id: variantId, productId, name: "Room Legacy Gov", kind: "hotel_room" })
		await upsertRatePlanTemplate({
			id: ratePlanTemplateId,
			name: "Legacy Gov Plan",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: ratePlanId,
			templateId: ratePlanTemplateId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		const paymentA = await createPolicyCapa6({
			category: "Payment",
			description: "Legacy Payment A",
			rules: { paymentType: "pay_at_property" },
		})
		await assignPolicyCapa6({
			policyId: paymentA.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		const paymentB = await createPolicyCapa6({
			category: "Payment",
			description: "Legacy Payment B",
			rules: { paymentType: "prepayment", prepaymentPercentage: 50 },
		})

		await expect(
			replacePolicyAssignmentCapa6({
				policyId: paymentB.policyId,
				scope: "rate_plan",
				scopeId: ratePlanId,
				channel: null,
				actorUserId: "user_legacy_gov_replace",
				checkIn: "2030-02-01",
				checkOut: "2030-02-03",
				requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
			})
		).rejects.toBeInstanceOf(PolicyValidationError)
	})
})
