import { and, db, eq, isNull, PolicyAssignment, PolicyAuditLog } from "astro:db"
import { describe, it, expect } from "vitest"

import {
	createPolicyCapa6,
	deactivatePolicyAssignmentCapa6,
	replacePolicyAssignmentCapa6,
	PolicyValidationError,
	resolveEffectivePolicies,
} from "@/modules/policies/public"

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
			ownerProviderId: "prov_test",
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
				ownerProviderId: "prov_test",
				category: "Cancellation",
				description: "Cancellation",
				// missing tiers
			} as any)
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("assigns by scope and replaces the active slot atomically and idempotently", async () => {
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
			kind: "hotel_room",
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
			ownerProviderId: "prov_test",
			category: "Other",
			description: "General terms",
			rules: { text: "Hello" },
		})

		// Product assignment
		const initial = await replacePolicyAssignmentCapa6({
			policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})
		const resolvedProduct = await resolveEffectivePolicies({ productId })
		expect(resolvedProduct.policies.some((p) => p.category === "Other")).toBe(true)

		const repeated = await replacePolicyAssignmentCapa6({
			policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})
		expect(repeated).toEqual({ assignmentId: initial.assignmentId, replaced: false })

		const replacementPolicy = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Other",
			description: "Replacement terms",
			rules: { text: "Updated" },
		})
		const replacement = await replacePolicyAssignmentCapa6({
			policyId: replacementPolicy.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
			actorUserId: "ops@example.test",
		})
		expect(replacement.replaced).toBe(true)

		const assignments = await db
			.select()
			.from(PolicyAssignment)
			.where(
				and(
					eq(PolicyAssignment.scope, "product"),
					eq(PolicyAssignment.scopeId, productId),
					eq(PolicyAssignment.category, "Other"),
					isNull(PolicyAssignment.channel)
				)
			)
			.all()
		expect(assignments.filter((row) => row.isActive)).toHaveLength(1)
		expect(assignments.find((row) => row.id === initial.assignmentId)?.isActive).toBe(false)
		expect(assignments.find((row) => row.id === replacement.assignmentId)?.isActive).toBe(true)

		const audit = await db
			.select()
			.from(PolicyAuditLog)
			.where(eq(PolicyAuditLog.assignmentId, replacement.assignmentId))
			.get()
		expect(audit).toEqual(
			expect.objectContaining({
				eventType: "assignment_replaced",
				actorUserId: "ops@example.test",
			})
		)

		// Variant assignment
		const created2 = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Payment",
			description: "Pay in advance",
			rules: { paymentType: "pay_at_property" },
		})
		await replacePolicyAssignmentCapa6({
			policyId: created2.policyId,
			scope: "variant",
			scopeId: variantId,
			channel: null,
		})
		const resolvedVariant = await resolveEffectivePolicies({ productId, variantId })
		expect(resolvedVariant.policies.some((p) => p.category === "Payment")).toBe(true)

		// Rate plan assignment
		const created3 = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Smoking",
			description: "No smoking at all",
		})
		await replacePolicyAssignmentCapa6({
			policyId: created3.policyId,
			scope: "rate_plan",
			scopeId: rpId,
			channel: null,
		})
		const resolvedRp = await resolveEffectivePolicies({ productId, variantId, ratePlanId: rpId })
		expect(resolvedRp.policies.some((p) => p.category === "Smoking")).toBe(true)
	})

	it("invalid scopeId => validation_error", async () => {
		const { policyId } = await createPolicyCapa6({
			ownerProviderId: "prov_test",
			category: "Other",
			description: "X",
		})
		await expect(
			replacePolicyAssignmentCapa6({
				policyId,
				scope: "product",
				scopeId: "missing",
				channel: null,
			})
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("deactivates only assignments owned by the requesting provider and audits the change", async () => {
		const suffix = crypto.randomUUID()
		const destinationId = `dest_deactivate_${suffix}`
		const productId = `prod_deactivate_${suffix}`
		const providerId = `prov_deactivate_${suffix}`
		await upsertDestination({
			id: destinationId,
			name: "Deactivate destination",
			type: "city",
			country: "CL",
			slug: `deactivate-${suffix}`,
		})
		await upsertProduct({
			id: productId,
			name: "Deactivate hotel",
			productType: "Hotel",
			destinationId,
			providerId,
		})
		const policy = await createPolicyCapa6({
			ownerProviderId: providerId,
			category: "Other",
			description: "Terms to deactivate",
			rules: { text: "Terms" },
		})
		const assignment = await replacePolicyAssignmentCapa6({
			policyId: policy.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		await expect(
			deactivatePolicyAssignmentCapa6({
				assignmentId: assignment.assignmentId,
				ownerProviderId: "prov_other",
			})
		).rejects.toThrow("POLICY_ASSIGNMENT_OWNER_MISMATCH")
		const stillActive = await db
			.select({ isActive: PolicyAssignment.isActive })
			.from(PolicyAssignment)
			.where(eq(PolicyAssignment.id, assignment.assignmentId))
			.get()
		expect(stillActive?.isActive).toBe(true)

		const result = await deactivatePolicyAssignmentCapa6({
			assignmentId: assignment.assignmentId,
			ownerProviderId: providerId,
			actorUserId: "ops_deactivate",
		})
		expect(result).toEqual({
			assignmentId: assignment.assignmentId,
			deactivated: true,
		})
		const audit = await db
			.select()
			.from(PolicyAuditLog)
			.where(eq(PolicyAuditLog.assignmentId, assignment.assignmentId))
			.all()
		expect(audit).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					eventType: "assignment_deactivated",
					actorUserId: "ops_deactivate",
				}),
			])
		)
	})
})
