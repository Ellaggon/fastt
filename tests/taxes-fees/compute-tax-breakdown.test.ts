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

describe("taxes-fees/computeTaxBreakdown", () => {
	it("stacks multiple taxes and fees additively with deterministic rounding", () => {
		const breakdown = computeTaxBreakdown({
			base: 100,
			definitions: [
				resolved({ code: "VAT", value: 7.25, kind: "tax" }),
				resolved({ code: "CITY", value: 2.5, kind: "tax" }),
				resolved({
					code: "CLEAN",
					kind: "fee",
					calculationType: "fixed",
					value: 9.99,
					currency: "USD",
				}),
			],
			nights: 1,
			guests: 1,
		})

		const excludedTaxes = breakdown.taxes.excluded.map((t) => t.amount)
		expect(excludedTaxes).toEqual([7.25, 2.5])
		expect(breakdown.fees.excluded[0].amount).toBe(9.99)
		expect(breakdown.fees.excluded[0].source.scope).toBe("product")
		expect(breakdown.total).toBe(119.74)
	})

	it("respects included vs excluded without changing base", () => {
		const breakdown = computeTaxBreakdown({
			base: 200,
			definitions: [
				resolved({ code: "VAT", value: 10, inclusionType: "included" }),
				resolved({
					code: "RESORT",
					kind: "fee",
					calculationType: "fixed",
					value: 20,
					currency: "USD",
				}),
			],
			nights: 1,
			guests: 1,
		})

		expect(breakdown.taxes.included[0].amount).toBe(20)
		expect(breakdown.total).toBe(220)
	})

	it("applies guest_night multiplier and does not apply tax-on-tax", () => {
		const breakdown = computeTaxBreakdown({
			base: 150,
			definitions: [
				resolved({
					code: "CITY",
					kind: "fee",
					calculationType: "fixed",
					value: 5,
					appliesPer: "guest_night",
					currency: "USD",
				}),
				resolved({ code: "VAT", value: 10 }),
			],
			nights: 2,
			guests: 2,
		})

		const city = breakdown.fees.excluded[0].amount
		expect(city).toBe(20)
		const vat = breakdown.taxes.excluded[0].amount
		expect(vat).toBe(15)
		expect(breakdown.total).toBe(185)
	})

	it("rounds per line deterministically for edge cases", () => {
		const breakdown = computeTaxBreakdown({
			base: 99.99,
			definitions: [resolved({ code: "VAT", value: 7.25 })],
			nights: 1,
			guests: 1,
		})

		expect(breakdown.taxes.excluded[0].amount).toBe(7.25)
		expect(breakdown.total).toBe(107.24)
	})

	it("handles included + excluded together without inflating base", () => {
		const breakdown = computeTaxBreakdown({
			base: 300,
			definitions: [
				resolved({ code: "VAT", value: 10, inclusionType: "included" }),
				resolved({
					code: "CITY",
					kind: "fee",
					calculationType: "fixed",
					value: 20,
					currency: "USD",
				}),
			],
			nights: 1,
			guests: 1,
		})

		expect(breakdown.taxes.included[0].amount).toBe(30)
		expect(breakdown.fees.excluded[0].amount).toBe(20)
		expect(breakdown.total).toBe(320)
	})

	it("supports high-value bookings with stable totals", () => {
		const breakdown = computeTaxBreakdown({
			base: 1_000_000,
			definitions: [resolved({ code: "VAT", value: 12 })],
			nights: 1,
			guests: 1,
		})

		expect(breakdown.taxes.excluded[0].amount).toBe(120000)
		expect(breakdown.total).toBe(1120000)
	})

	it("allows 0 guests without throwing (guest_night becomes 0)", () => {
		const breakdown = computeTaxBreakdown({
			base: 100,
			definitions: [
				resolved({
					code: "CITY",
					kind: "fee",
					calculationType: "fixed",
					value: 5,
					appliesPer: "guest_night",
					currency: "USD",
				}),
			],
			nights: 1,
			guests: 0,
		})

		expect(breakdown.fees.excluded[0].amount).toBe(0)
		expect(breakdown.total).toBe(100)
	})
})
