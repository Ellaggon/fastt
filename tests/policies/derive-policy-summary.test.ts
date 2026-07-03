import { describe, expect, it } from "vitest"

import { derivePolicySummaryFromResolvedPolicies } from "@/modules/policies/public"

function resolved(params: {
	policies?: Array<{
		category: string
		policyPresetKey?: string
		description?: string
	}>
	missingCategories?: string[]
}) {
	return {
		version: "v2",
		policies: (params.policies ?? []).map((item, index) => ({
			category: item.category,
			resolvedFromScope: "rate_plan",
			policy: {
				id: `policy-${index}`,
				groupId: `group-${index}`,
				description: item.description ?? "",
				version: 1,
				status: "active",
				policyPresetKey: item.policyPresetKey ?? null,
				rules: [],
				cancellationTiers: [],
			},
		})),
		missingCategories: params.missingCategories ?? [],
		coverage: { hasFullCoverage: (params.missingCategories ?? []).length === 0 },
		asOfDate: "2026-07-03",
		warnings: [],
	} as any
}

describe("derivePolicySummaryFromResolvedPolicies", () => {
	it("does not imply configured policies when every category is missing", () => {
		expect(
			derivePolicySummaryFromResolvedPolicies(
				resolved({
					missingCategories: ["Cancellation", "Payment", "CheckIn", "NoShow"],
				})
			)
		).toBe("Sin condiciones configuradas")
	})

	it("names configured and pending conditions without generic policy fallbacks", () => {
		expect(
			derivePolicySummaryFromResolvedPolicies(
				resolved({
					policies: [{ category: "Cancellation", policyPresetKey: "flexible" }],
					missingCategories: ["Payment", "CheckIn", "NoShow"],
				})
			)
		).toBe("Cancelación flexible · Pendientes: pago, llegada/salida y no presentación")
	})

	it("summarizes a complete contract in guest-readable language", () => {
		expect(
			derivePolicySummaryFromResolvedPolicies(
				resolved({
					policies: [
						{ category: "Cancellation", policyPresetKey: "flexible" },
						{ category: "Payment", policyPresetKey: "pay_at_property" },
						{ category: "CheckIn", policyPresetKey: "standard_check_in" },
						{ category: "NoShow", policyPresetKey: "no_show_first_night" },
					],
				})
			)
		).toBe(
			"Cancelación flexible · Pago en propiedad · Llegada y salida estándar · No presentación: primera noche"
		)
	})
})
