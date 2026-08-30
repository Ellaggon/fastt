import { describe, expect, it, vi } from "vitest"

import { PricingRuleCommandService } from "@/modules/pricing/public"

const context = {
	providerId: "provider-1",
	productId: "product-1",
	variantId: "variant-1",
	ratePlanId: "rate-plan-1",
}

function dependencies(generatedDatesCount = 2) {
	return {
		getPricingSummary: vi.fn().mockResolvedValue({ basePrice: 100, currency: "USD" }),
		getFallbackCurrency: vi.fn().mockResolvedValue("USD"),
		listRules: vi.fn().mockResolvedValue([]),
		createRule: vi.fn().mockResolvedValue({ ruleId: "rule-1" }),
		rematerialize: vi.fn().mockResolvedValue({
			missingDatesCount: generatedDatesCount,
			generatedDatesCount,
		}),
		invalidatePricingBatch: vi.fn().mockResolvedValue(undefined),
		enqueueAri: vi.fn().mockResolvedValue(undefined),
	}
}

describe("PricingRuleCommandService", () => {
	it("previews a normalized command without executing write-side effects", async () => {
		const deps = dependencies()
		const service = new PricingRuleCommandService(deps)

		const result = await service.previewCandidate(context, {
			type: "percentage_markup",
			value: 10,
			priority: 10,
			previewFrom: "2026-09-01",
			previewDays: 2,
		})

		expect(result.days).toHaveLength(2)
		expect(result.days[0]).toMatchObject({ before: 100, after: 110, delta: 10 })
		expect(deps.createRule).not.toHaveBeenCalled()
		expect(deps.rematerialize).not.toHaveBeenCalled()
		expect(deps.invalidatePricingBatch).not.toHaveBeenCalled()
		expect(deps.enqueueAri).not.toHaveBeenCalled()
	})

	it("creates, rematerializes and dispatches cache and ARI effects explicitly", async () => {
		const deps = dependencies()
		const service = new PricingRuleCommandService(deps)

		const result = await service.createRule(context, {
			type: "percentage_markup",
			value: 10,
			priority: 10,
			dateFrom: "2026-09-01",
			dateTo: "2026-09-07",
		})

		expect(result.ruleId).toBe("rule-1")
		expect(deps.rematerialize).toHaveBeenCalledWith(
			expect.objectContaining({
				variantId: context.variantId,
				ratePlanId: context.ratePlanId,
				from: "2026-09-01",
				to: "2026-09-08",
			})
		)
		expect(deps.invalidatePricingBatch).toHaveBeenCalledWith({
			ratePlanIds: [context.ratePlanId],
			variantIds: [context.variantId],
		})
		expect(deps.enqueueAri).toHaveBeenCalledWith({
			variantIds: [context.variantId],
			ratePlanIds: [context.ratePlanId],
			from: "2026-09-01",
			toExclusive: "2026-09-08",
		})
	})

	it("propagates a durable idempotency key and reports a replay", async () => {
		const deps = dependencies()
		deps.createRule.mockResolvedValueOnce({ ruleId: "rule-1", replayed: true })
		const service = new PricingRuleCommandService(deps)

		const result = await service.createRule(context, {
			type: "percentage_markup",
			value: 10,
			priority: 10,
			idempotencyKey: "pricing-bulk:job-1:rate-plan-1",
		})

		expect(deps.createRule).toHaveBeenCalledWith(
			expect.objectContaining({ idempotencyKey: "pricing-bulk:job-1:rate-plan-1" })
		)
		expect(result.replayed).toBe(true)
	})

	it("does not dispatch cache or ARI when rematerialization produced no dates", async () => {
		const deps = dependencies(0)
		const service = new PricingRuleCommandService(deps)

		await service.createRule(context, {
			type: "fixed_adjustment",
			value: 5,
			priority: 10,
		})

		expect(deps.invalidatePricingBatch).not.toHaveBeenCalled()
		expect(deps.enqueueAri).not.toHaveBeenCalled()
	})

	it("defers materialization and effects while preserving a durable impact descriptor", async () => {
		const deps = dependencies()
		const service = new PricingRuleCommandService(deps)

		const result = await service.createRule(
			context,
			{
				type: "percentage_markup",
				value: 10,
				priority: 10,
				dateFrom: "2026-09-01",
				dateTo: "2026-09-07",
				occupancyKey: "a2_c0_i0",
			},
			{ executionMode: "deferred" }
		)

		expect(result.impact).toEqual({
			ratePlanId: "rate-plan-1",
			variantId: "variant-1",
			from: "2026-09-01",
			toExclusive: "2026-09-08",
			occupancyKey: "a2_c0_i0",
		})
		expect(result.rematerialization).toBeNull()
		expect(deps.rematerialize).not.toHaveBeenCalled()
		expect(deps.invalidatePricingBatch).not.toHaveBeenCalled()
		expect(deps.enqueueAri).not.toHaveBeenCalled()
	})

	it("coalesces deferred impacts before invalidating caches and enqueuing ARI", async () => {
		const deps = dependencies()
		const service = new PricingRuleCommandService(deps)

		const result = await service.finalizeDeferredImpacts({
			idempotencyScope: "pricing-bulk:job-1:effects",
			impacts: [
				{
					ratePlanId: "rate-plan-1",
					variantId: "variant-1",
					from: "2026-09-01",
					toExclusive: "2026-09-05",
					occupancyKey: null,
				},
				{
					ratePlanId: "rate-plan-1",
					variantId: "variant-1",
					from: "2026-09-03",
					toExclusive: "2026-09-10",
					occupancyKey: null,
				},
			],
		})

		expect(deps.rematerialize).toHaveBeenCalledTimes(1)
		expect(deps.invalidatePricingBatch).toHaveBeenCalledOnce()
		expect(deps.enqueueAri).toHaveBeenCalledWith({
			variantIds: ["variant-1"],
			ratePlanIds: ["rate-plan-1"],
			from: "2026-09-01",
			toExclusive: "2026-09-10",
			idempotencyScope: "pricing-bulk:job-1:effects",
			critical: true,
		})
		expect(result.materializations).toHaveLength(1)
	})
})
