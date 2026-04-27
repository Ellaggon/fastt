import { describe, it, expect } from "vitest"

import {
	assignPolicyCapa6,
	createPolicyCapa6,
	mapResolvedPoliciesToUI,
	replacePolicyAssignmentCapa6,
	resolveEffectivePolicies,
} from "@/modules/policies/public"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/policies CAPA 6 Step 8 (explainability + overrides)", () => {
	it("missing policies => resolver returns empty + UI mapping is []", async () => {
		const destinationId = `dest_pol8_${crypto.randomUUID()}`
		const productId = `prod_pol8_${crypto.randomUUID()}`

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

		const resolved = await resolveEffectivePolicies({ productId })
		expect(resolved.policies).toEqual([])
		expect(mapResolvedPoliciesToUI(resolved)).toEqual([])
	})

	it("rate_plan overrides inherited policy, and change uses replacement semantics", async () => {
		const destinationId = `dest_pol8_${crypto.randomUUID()}`
		const productId = `prod_pol8_${crypto.randomUUID()}`
		const variantId = `var_pol8_${crypto.randomUUID()}`

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
			kind: "hotel_room",
			name: "Room 1",
		})

		const rptId = `rpt_pol8_${crypto.randomUUID()}`
		const rpId = `rp_pol8_${crypto.randomUUID()}`
		await upsertRatePlanTemplate({
			id: rptId,
			name: "Default",
			paymentType: "pay_at_property",
			refundable: true,
		})
		await upsertRatePlan({
			id: rpId,
			templateId: rptId,
			variantId,
			isActive: true,
			isDefault: true,
		})

		// Inherited (product-level)
		const p1 = await createPolicyCapa6({ category: "Payment", description: "Pay at property" })
		await assignPolicyCapa6({
			policyId: p1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		const inherited = await resolveEffectivePolicies({ productId, variantId, ratePlanId: rpId })
		const inheritedPayment = inherited.policies.find((p) => p.category === "Payment")
		expect(inheritedPayment?.resolvedFromScope).toBe("product")
		expect(inheritedPayment?.policy.id).toBe(p1.policyId)

		// Override at rate plan
		const p2 = await createPolicyCapa6({ category: "Payment", description: "Prepayment required" })
		await assignPolicyCapa6({
			policyId: p2.policyId,
			scope: "rate_plan",
			scopeId: rpId,
			channel: null,
		})

		const overridden = await resolveEffectivePolicies({ productId, variantId, ratePlanId: rpId })
		const overriddenPayment = overridden.policies.find((p) => p.category === "Payment")
		expect(overriddenPayment?.resolvedFromScope).toBe("rate_plan")
		expect(overriddenPayment?.policy.id).toBe(p2.policyId)

		// Change: replace assignment without deleting history
		const p3 = await createPolicyCapa6({ category: "Payment", description: "Deposit 20%" })
		const replaced = await replacePolicyAssignmentCapa6({
			policyId: p3.policyId,
			scope: "rate_plan",
			scopeId: rpId,
			channel: null,
		})
		expect(replaced.assignmentId).toMatch(/.+/)
		expect(replaced.replaced).toBe(true)

		const changed = await resolveEffectivePolicies({ productId, variantId, ratePlanId: rpId })
		const changedPayment = changed.policies.find((p) => p.category === "Payment")
		expect(changedPayment?.resolvedFromScope).toBe("rate_plan")
		expect(changedPayment?.policy.id).toBe(p3.policyId)
	})
})
