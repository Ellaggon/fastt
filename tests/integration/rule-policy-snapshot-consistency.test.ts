import { describe, expect, it } from "vitest"

import {
	assignPolicyCapa6,
	buildPolicySnapshot,
	createPolicyCapa6,
	createPolicyVersionCapa6,
	normalizePolicyResolutionResult,
	resolveEffectivePolicies,
} from "@/modules/policies/public"
import {
	buildRuleSnapshot,
	comparePolicyAndRuleSnapshots,
	resolveEffectiveRules,
} from "@/modules/rules/public"
import {
	upsertDestination,
	upsertProduct,
	upsertRatePlan,
	upsertRatePlanTemplate,
	upsertVariant,
} from "@/shared/infrastructure/test-support/db-test-data"

async function setupContext(tag: string) {
	const destinationId = `dest_rules_${tag}_${crypto.randomUUID()}`
	const productId = `prod_rules_${tag}_${crypto.randomUUID()}`
	const variantId = `var_rules_${tag}_${crypto.randomUUID()}`
	const templateId = `rpt_rules_${tag}_${crypto.randomUUID()}`
	const ratePlanId = `rp_rules_${tag}_${crypto.randomUUID()}`
	const channel = "web"

	await upsertDestination({
		id: destinationId,
		name: `Rules Dest ${tag}`,
		type: "city",
		country: "CL",
		slug: `rules-${tag}-${destinationId}`,
	})
	await upsertProduct({
		id: productId,
		name: `Rules Product ${tag}`,
		productType: "Hotel",
		destinationId,
	})
	await upsertVariant({ id: variantId, productId, kind: "hotel_room", name: "Room" })
	await upsertRatePlanTemplate({
		id: templateId,
		name: `Template ${tag}`,
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

	return { destinationId, productId, variantId, templateId, ratePlanId, channel }
}

async function createRequiredRatePlanPolicies(params: {
	ratePlanId: string
	channel: string
	paymentDescription?: string
	paymentRules?: Record<string, unknown>
	effectiveFrom?: string
	effectiveTo?: string
}) {
	const payment = await createPolicyCapa6({
		category: "Payment",
		description: params.paymentDescription ?? "Pay at property",
		rules: params.paymentRules ?? { paymentType: "pay_at_property" },
		effectiveFrom: params.effectiveFrom,
		effectiveTo: params.effectiveTo,
	})
	const cancellation = await createPolicyCapa6({
		category: "Cancellation",
		description: "Flexible cancellation",
		cancellationTiers: [{ daysBeforeArrival: 1, penaltyType: "percentage", penaltyAmount: 100 }],
	})
	const checkIn = await createPolicyCapa6({
		category: "CheckIn",
		description: "Standard check-in",
		rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
	})
	const noShow = await createPolicyCapa6({
		category: "NoShow",
		description: "No-show first night",
		rules: { penaltyType: "first_night" },
	})

	for (const policy of [payment, cancellation, checkIn, noShow]) {
		await assignPolicyCapa6({
			policyId: policy.policyId,
			scope: "rate_plan",
			scopeId: params.ratePlanId,
			channel: params.channel,
		})
	}

	return {
		paymentPolicyId: payment.policyId,
	}
}

async function resolveSnapshots(params: {
	productId: string
	variantId: string
	ratePlanId: string
	channel: string
	checkIn: string
	checkOut: string
}) {
	const resolvedPoliciesRaw = await resolveEffectivePolicies({
		productId: params.productId,
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		checkIn: params.checkIn,
		checkOut: params.checkOut,
		channel: params.channel,
		requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		onMissingCategory: "return_null",
	})
	const resolvedPolicies = normalizePolicyResolutionResult(resolvedPoliciesRaw, {
		asOfDate: params.checkIn,
		warnings: [],
	}).dto
	const resolvedRules = await resolveEffectiveRules({
		productId: params.productId,
		variantId: params.variantId,
		ratePlanId: params.ratePlanId,
		checkIn: params.checkIn,
		checkOut: params.checkOut,
		channel: params.channel,
		requiredCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
		onMissingCategory: "return_null",
	})
	const policySnapshot = buildPolicySnapshot({
		resolvedPolicies,
		checkIn: params.checkIn,
		checkOut: params.checkOut,
		channel: params.channel,
		resolvedAt: new Date("2030-01-01T00:00:00.000Z"),
	})
	const ruleSnapshot = buildRuleSnapshot({
		resolvedRules,
		resolvedAt: new Date("2030-01-01T00:00:00.000Z"),
	})
	return { policySnapshot, ruleSnapshot }
}

describe("integration/rule-policy snapshot consistency", () => {
	it("same input yields consistent policySnapshot and ruleSnapshot", async () => {
		const ctx = await setupContext("baseline")
		await createRequiredRatePlanPolicies({
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
		})
		const { policySnapshot, ruleSnapshot } = await resolveSnapshots({
			productId: ctx.productId,
			variantId: ctx.variantId,
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
			checkIn: "2030-04-10",
			checkOut: "2030-04-12",
		})
		const compared = comparePolicyAndRuleSnapshots(policySnapshot, ruleSnapshot)
		expect(compared.isConsistent).toBe(true)
		expect(compared.mismatches).toEqual([])
	})

	it("reports missing category mismatches when rule snapshot is incomplete", async () => {
		const ctx = await setupContext("missing")
		await createRequiredRatePlanPolicies({
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
		})
		const { policySnapshot, ruleSnapshot } = await resolveSnapshots({
			productId: ctx.productId,
			variantId: ctx.variantId,
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
			checkIn: "2030-05-10",
			checkOut: "2030-05-12",
		})

		const incompleteRuleSnapshot = {
			...ruleSnapshot,
			contractTerms: ruleSnapshot.contractTerms.filter(
				(term) => String(term.category ?? "").toLowerCase() !== "payment"
			),
		}
		const compared = comparePolicyAndRuleSnapshots(policySnapshot, incompleteRuleSnapshot)
		expect(compared.isConsistent).toBe(false)
		expect(compared.mismatches.some((item) => item.category === "payment")).toBe(true)
	})

	it("remains consistent with multiple assignments and deterministic winner selection", async () => {
		const ctx = await setupContext("multiple")
		const productPayment = await createPolicyCapa6({
			category: "Payment",
			description: "Payment Product",
			rules: { paymentType: "pay_at_property" },
		})
		const ratePlanPayment = await createPolicyCapa6({
			category: "Payment",
			description: "Payment RatePlan",
			rules: { paymentType: "prepayment" },
		})
		await assignPolicyCapa6({
			policyId: productPayment.policyId,
			scope: "product",
			scopeId: ctx.productId,
			channel: ctx.channel,
		})
		await assignPolicyCapa6({
			policyId: ratePlanPayment.policyId,
			scope: "rate_plan",
			scopeId: ctx.ratePlanId,
			channel: ctx.channel,
		})
		const cancellation = await createPolicyCapa6({
			category: "Cancellation",
			description: "Flexible cancellation",
			cancellationTiers: [{ daysBeforeArrival: 2, penaltyType: "percentage", penaltyAmount: 100 }],
		})
		const checkIn = await createPolicyCapa6({
			category: "CheckIn",
			description: "Standard check-in",
			rules: { checkInFrom: "15:00", checkInUntil: "23:00", checkOutUntil: "11:00" },
		})
		const noShow = await createPolicyCapa6({
			category: "NoShow",
			description: "No-show first night",
			rules: { penaltyType: "first_night" },
		})
		for (const policy of [cancellation, checkIn, noShow]) {
			await assignPolicyCapa6({
				policyId: policy.policyId,
				scope: "rate_plan",
				scopeId: ctx.ratePlanId,
				channel: ctx.channel,
			})
		}

		const { policySnapshot, ruleSnapshot } = await resolveSnapshots({
			productId: ctx.productId,
			variantId: ctx.variantId,
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
			checkIn: "2030-06-10",
			checkOut: "2030-06-12",
		})
		const compared = comparePolicyAndRuleSnapshots(policySnapshot, ruleSnapshot)
		expect(compared.isConsistent).toBe(true)
		expect(compared.mismatches).toEqual([])
	})

	it("remains consistent for overlapping date windows across policy versions", async () => {
		const ctx = await setupContext("dates")
		const { paymentPolicyId } = await createRequiredRatePlanPolicies({
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
			paymentDescription: "Pay at property v1",
			effectiveFrom: "2030-07-01T00:00:00.000Z",
			effectiveTo: "2030-07-10T23:59:59.999Z",
		})
		await createPolicyVersionCapa6({
			previousPolicyId: paymentPolicyId,
			description: "Pay at property v2",
			rules: { paymentType: "prepayment" },
			effectiveFrom: "2030-07-11T00:00:00.000Z",
		})

		const stay1 = await resolveSnapshots({
			productId: ctx.productId,
			variantId: ctx.variantId,
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
			checkIn: "2030-07-08",
			checkOut: "2030-07-10",
		})
		const compared1 = comparePolicyAndRuleSnapshots(stay1.policySnapshot, stay1.ruleSnapshot)
		expect(compared1.isConsistent).toBe(true)

		const stay2 = await resolveSnapshots({
			productId: ctx.productId,
			variantId: ctx.variantId,
			ratePlanId: ctx.ratePlanId,
			channel: ctx.channel,
			checkIn: "2030-07-12",
			checkOut: "2030-07-14",
		})
		const compared2 = comparePolicyAndRuleSnapshots(stay2.policySnapshot, stay2.ruleSnapshot)
		expect(compared2.isConsistent).toBe(true)
	})
})
