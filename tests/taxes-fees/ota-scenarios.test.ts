import { describe, it, expect } from "vitest"
import { computeTaxBreakdown } from "@/modules/taxes-fees/public"
import type { ResolvedTaxFeeDefinition, TaxFeeDefinition } from "@/modules/taxes-fees/public"

function def(partial: Partial<TaxFeeDefinition>): TaxFeeDefinition {
	return {
		id: partial.id ?? crypto.randomUUID(),
		providerId: partial.providerId ?? null,
		code: partial.code ?? "TAX",
		name: partial.name ?? "Tax",
		kind: partial.kind ?? "tax",
		calculationType: partial.calculationType ?? "percentage",
		value: partial.value ?? 10,
		currency: partial.currency ?? null,
		inclusionType: partial.inclusionType ?? "excluded",
		appliesPer: partial.appliesPer ?? "stay",
		priority: partial.priority ?? 0,
		jurisdictionJson: partial.jurisdictionJson ?? null,
		effectiveFrom: partial.effectiveFrom ?? null,
		effectiveTo: partial.effectiveTo ?? null,
		status: partial.status ?? "active",
		createdAt: partial.createdAt ?? new Date(),
		updatedAt: partial.updatedAt ?? new Date(),
	}
}

function resolved(partial: Partial<TaxFeeDefinition>): ResolvedTaxFeeDefinition {
	const definition = def(partial)
	return {
		definition,
		source: {
			scope: "product",
			scopeId: "prod_test",
			definitionId: definition.id,
		},
	}
}

describe("taxes-fees/OTA scenarios", () => {
	it("included tax (EU-style) keeps base and reports included line", () => {
		const breakdown = computeTaxBreakdown({
			base: 200,
			definitions: [resolved({ code: "VAT", value: 21, inclusionType: "included" })],
			nights: 2,
			guests: 2,
		})

		expect(breakdown.base).toBe(200)
		expect(breakdown.taxes.included[0].amount).toBe(42)
		expect(breakdown.total).toBe(200)
	})

	it("excluded tax adds to total and shows + taxes", () => {
		const breakdown = computeTaxBreakdown({
			base: 100,
			definitions: [resolved({ code: "VAT", value: 10, inclusionType: "excluded" })],
			nights: 1,
			guests: 2,
		})

		expect(breakdown.taxes.excluded[0].amount).toBe(10)
		expect(breakdown.total).toBe(110)
	})

	it("stacked taxes add together deterministically", () => {
		const breakdown = computeTaxBreakdown({
			base: 150,
			definitions: [resolved({ code: "VAT", value: 10 }), resolved({ code: "CITY", value: 5 })],
			nights: 1,
			guests: 2,
		})

		const totalExcluded = breakdown.taxes.excluded.reduce((sum, t) => sum + t.amount, 0)
		expect(totalExcluded).toBe(22.5)
		expect(breakdown.total).toBe(172.5)
	})

	it("mixed included + excluded keeps base and adds excluded only", () => {
		const breakdown = computeTaxBreakdown({
			base: 250,
			definitions: [
				resolved({ code: "VAT", value: 10, inclusionType: "included" }),
				resolved({ code: "CITY", value: 5, inclusionType: "excluded" }),
			],
			nights: 1,
			guests: 1,
		})

		expect(breakdown.taxes.included[0].amount).toBe(25)
		expect(breakdown.taxes.excluded[0].amount).toBe(12.5)
		expect(breakdown.total).toBe(262.5)
	})

	it("rounding edge case: per-line rounding is deterministic", () => {
		const breakdown = computeTaxBreakdown({
			base: 99.99,
			definitions: [resolved({ code: "VAT", value: 7.25 })],
			nights: 1,
			guests: 1,
		})

		expect(breakdown.taxes.excluded[0].amount).toBe(7.25)
		expect(breakdown.total).toBe(107.24)
	})
})
