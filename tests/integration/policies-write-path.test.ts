import { describe, it, expect } from "vitest"

import {
	createPolicyCapa6,
	assignPolicyCapa6,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import { PolicyValidationError } from "@/modules/policies/public"

import {
	upsertDestination,
	upsertProduct,
	upsertVariant,
	upsertRatePlanTemplate,
	upsertRatePlan,
} from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/policies CAPA 6 Step 4 (write path)", () => {
	it("create policy OK + cancellation requires tiers", async () => {
		const created = await createPolicyCapa6({
			category: "Other",
			description: "General terms",
			rules: { text: "Hello" },
		})
		expect(created.policyId).toMatch(/.+/)
		expect(created.groupId).toMatch(/.+/)
		expect(created.category).toBe("Other")
		expect(created.version).toBe(1)

		await expect(
			createPolicyCapa6({
				category: "Cancellation",
				description: "Cancellation",
				// missing tiers
			} as any)
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("assign to product/variant/rate_plan + duplicate prevention", async () => {
		const destinationId = `dest_pol_${crypto.randomUUID()}`
		const productId = `prod_pol_${crypto.randomUUID()}`
		const variantId = `var_pol_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Policy Destination",
			type: "city",
			country: "CL",
			slug: "policy-destination",
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

		const rptId = `rpt_pol_${crypto.randomUUID()}`
		const rpId = `rp_pol_${crypto.randomUUID()}`
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

		const { policyId } = await createPolicyCapa6({
			category: "Other",
			description: "General terms",
			rules: { text: "Hello" },
		})

		// Product assignment
		await assignPolicyCapa6({ policyId, scope: "product", scopeId: productId, channel: null })
		const resolvedProduct = await resolveEffectivePolicies({ productId })
		expect(resolvedProduct.policies.some((p) => p.category === "Other")).toBe(true)

		// Duplicate prevention (same category/scope/channel)
		await expect(
			assignPolicyCapa6({ policyId, scope: "product", scopeId: productId, channel: null })
		).rejects.toBeInstanceOf(PolicyValidationError)

		// Variant assignment
		const created2 = await createPolicyCapa6({ category: "Payment", description: "Pay in advance" })
		await assignPolicyCapa6({
			policyId: created2.policyId,
			scope: "variant",
			scopeId: variantId,
			channel: null,
		})
		const resolvedVariant = await resolveEffectivePolicies({ productId, variantId })
		expect(resolvedVariant.policies.some((p) => p.category === "Payment")).toBe(true)

		// Rate plan assignment
		const created3 = await createPolicyCapa6({
			category: "Smoking",
			description: "No smoking at all",
		})
		await assignPolicyCapa6({
			policyId: created3.policyId,
			scope: "rate_plan",
			scopeId: rpId,
			channel: null,
		})
		const resolvedRp = await resolveEffectivePolicies({ productId, variantId, ratePlanId: rpId })
		expect(resolvedRp.policies.some((p) => p.category === "Smoking")).toBe(true)
	})

	it("invalid scopeId => validation_error", async () => {
		const { policyId } = await createPolicyCapa6({ category: "Other", description: "X" })
		await expect(
			assignPolicyCapa6({ policyId, scope: "product", scopeId: "missing", channel: null })
		).rejects.toBeInstanceOf(PolicyValidationError)
	})
})
