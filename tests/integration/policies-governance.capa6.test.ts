import { describe, expect, it } from "vitest"
import { db, PolicyAuditLog, and, eq } from "astro:db"

import {
	assignPolicyCapa6,
	createPolicyCapa6,
	createPolicyVersionCapa6,
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

describe("integration/policies governance CAPA6", () => {
	it("rejects overlapping effective ranges when creating policy versions", async () => {
		const destinationId = `dest_gov_${crypto.randomUUID()}`
		const productId = `prod_gov_${crypto.randomUUID()}`
		await upsertDestination({
			id: destinationId,
			name: "Gov Dest",
			type: "city",
			country: "CL",
			slug: `gov-dest-${crypto.randomUUID()}`,
		})
		await upsertProduct({ id: productId, name: "Gov Product", productType: "Hotel", destinationId })

		const v1 = await createPolicyCapa6({
			category: "Payment",
			description: "Pay at property",
			rules: { paymentType: "pay_at_property" },
			effectiveFrom: "2030-01-20",
			effectiveTo: "2030-01-31",
		})
		await assignPolicyCapa6({
			policyId: v1.policyId,
			scope: "product",
			scopeId: productId,
			channel: null,
		})

		await createPolicyVersionCapa6({
			previousPolicyId: v1.policyId,
			description: "Window v2",
			rules: { paymentType: "pay_at_property" },
			effectiveFrom: "2030-01-01",
			effectiveTo: "2030-01-10",
			actorUserId: "user_gov",
		})

		const creationAudit = await db
			.select()
			.from(PolicyAuditLog)
			.where(
				and(
					eq(PolicyAuditLog.eventType, "policy_version_created"),
					eq(PolicyAuditLog.actorUserId, "user_gov")
				)
			)
		expect(creationAudit.length).toBeGreaterThan(0)

		await expect(
			createPolicyVersionCapa6({
				previousPolicyId: v1.policyId,
				description: "Window overlapping",
				rules: { paymentType: "prepayment" },
				effectiveFrom: "2030-01-05",
				effectiveTo: "2030-01-12",
				actorUserId: "user_gov",
			})
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("validates cancellation tier coherence", async () => {
		const c1 = await createPolicyCapa6({
			category: "Cancellation",
			description: "Base cancellation",
			cancellationTiers: [
				{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 10 },
				{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 40 },
			],
		})

		await expect(
			createPolicyVersionCapa6({
				previousPolicyId: c1.policyId,
				description: "Invalid monotonic",
				cancellationTiers: [
					{ daysBeforeArrival: 30, penaltyType: "percentage", penaltyAmount: 80 },
					{ daysBeforeArrival: 7, penaltyType: "percentage", penaltyAmount: 10 },
				],
			})
		).rejects.toBeInstanceOf(PolicyValidationError)
	})

	it("replaces assignment and records audit entry", async () => {
		const destinationId = `dest_gov2_${crypto.randomUUID()}`
		const productId = `prod_gov2_${crypto.randomUUID()}`
		const variantId = `var_gov2_${crypto.randomUUID()}`
		const ratePlanTemplateId = `rpt_gov2_${crypto.randomUUID()}`
		const ratePlanId = `rp_gov2_${crypto.randomUUID()}`

		await upsertDestination({
			id: destinationId,
			name: "Gov Dest 2",
			type: "city",
			country: "CL",
			slug: `gov2-dest-${crypto.randomUUID()}`,
		})
		await upsertProduct({
			id: productId,
			name: "Gov Product 2",
			productType: "Hotel",
			destinationId,
		})
		await upsertVariant({ id: variantId, productId, name: "Room Gov", kind: "hotel_room" })
		await upsertRatePlanTemplate({
			id: ratePlanTemplateId,
			name: "Gov Plan",
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
			description: "Payment A",
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
			description: "Payment B",
			rules: { paymentType: "prepayment", prepaymentPercentage: 50 },
		})

		const replaced = await replacePolicyAssignmentCapa6({
			policyId: paymentB.policyId,
			scope: "rate_plan",
			scopeId: ratePlanId,
			channel: null,
			actorUserId: "user_gov_replace",
			checkIn: "2030-02-01",
			checkOut: "2030-02-03",
			requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		})
		expect(replaced.assignmentId).toBeTruthy()

		const auditRows = await db
			.select()
			.from(PolicyAuditLog)
			.where(
				and(
					eq(PolicyAuditLog.eventType, "assignment_replaced"),
					eq(PolicyAuditLog.actorUserId, "user_gov_replace")
				)
			)
		expect(auditRows.length).toBeGreaterThan(0)
	})
})
