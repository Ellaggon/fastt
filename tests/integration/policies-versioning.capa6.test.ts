import { describe, it, expect } from "vitest"

import { db, PolicyAssignment, eq } from "astro:db"

import {
	createPolicyCapa6,
	createPolicyVersionCapa6,
	assignPolicyCapa6,
	resolveEffectivePolicies,
} from "@/modules/policies/public"

import { upsertDestination, upsertProduct } from "@/shared/infrastructure/test-support/db-test-data"

describe("integration/policies versioning (CAPA 6 Step 7)", () => {
	it("creates v2 without changing assignment; resolver picks latest active version", async () => {
		const destinationId = `dest_ver_${crypto.randomUUID()}`
		const productId = `prod_ver_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Ver Dest",
			type: "city",
			country: "CL",
			slug: "ver-dest",
		})
		await upsertProduct({ id: productId, name: "Ver Product", productType: "Hotel", destinationId })

		const v1 = await createPolicyCapa6({
			category: "Payment",
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
		})
		await assignPolicyCapa6({
			policyId: v1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		const beforeAssign = await db
			.select()
			.from(PolicyAssignment)
			.where(eq(PolicyAssignment.scopeId, productId))
		expect(beforeAssign.length).toBe(1)

		const resolved1 = await resolveEffectivePolicies({ productId })
		const pay1 = resolved1.policies.find((p) => p.category === "Payment")
		expect(pay1?.policy?.id).toBe(v1.policyId)
		expect(pay1?.policy?.version).toBe(1)

		const v2 = await createPolicyVersionCapa6({
			previousPolicyId: v1.policyId,
			description: "Prepayment 50%",
			rules: {
				paymentType: "prepayment",
				prepaymentPercentage: 50,
				prepaymentDaysBeforeArrival: null,
			},
		})
		expect(v2.version).toBe(2)
		expect(v2.groupId).toBe(v1.groupId)

		const afterAssign = await db
			.select()
			.from(PolicyAssignment)
			.where(eq(PolicyAssignment.scopeId, productId))
		expect(afterAssign.length).toBe(1)

		const resolved2 = await resolveEffectivePolicies({ productId })
		const pay2 = resolved2.policies.find((p) => p.category === "Payment")
		expect(pay2?.policy?.id).toBe(v2.policyId)
		expect(pay2?.policy?.version).toBe(2)
	})

	it("version uses max(group)+1 (not previous.version+1)", async () => {
		const destinationId = `dest_ver2_${crypto.randomUUID()}`
		const productId = `prod_ver2_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Ver2 Dest",
			type: "city",
			country: "CL",
			slug: "ver2-dest",
		})
		await upsertProduct({
			id: productId,
			name: "Ver2 Product",
			productType: "Hotel",
			destinationId,
		})

		const v1 = await createPolicyCapa6({
			category: "Other",
			description: "Terms v1",
			rules: { foo: "bar" },
		})
		await assignPolicyCapa6({
			policyId: v1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		const v2 = await createPolicyVersionCapa6({
			previousPolicyId: v1.policyId,
			description: "Terms v2",
			rules: { foo: "baz" },
		})
		expect(v2.version).toBe(2)

		// Create another version still pointing to v1, should become v3 (max+1), not v2 again.
		const v3 = await createPolicyVersionCapa6({
			previousPolicyId: v1.policyId,
			description: "Terms v3",
			rules: { foo: "qux" },
		})
		expect(v3.version).toBe(3)

		const resolved = await resolveEffectivePolicies({ productId })
		const other = resolved.policies.find((p) => p.category === "Other")
		expect(other?.policy?.id).toBe(v3.policyId)
		expect(other?.policy?.version).toBe(3)
	})
})
