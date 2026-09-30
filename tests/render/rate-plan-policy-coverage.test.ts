import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import RatePlanPoliciesSurface from "@/components/policy/RatePlanPoliciesSurface.astro"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"
import type { PolicyPlanView } from "@/modules/policies/public"

function plan(productType: string, missingCategories: string[] = []): PolicyPlanView {
	const requiredCategories = getRequiredPolicyCategories(productType)
	return {
		ratePlanId: "rate-fixture",
		ratePlanName: "Tarifa de prueba",
		isDefault: true,
		requiredCategories,
		coverageCount: requiredCategories.length - missingCategories.length,
		missingCategories,
		isSellableByContract: requiredCategories.length > 0 && missingCategories.length === 0,
		sellabilityLabel: "Estado de prueba",
		policySummary: "Condiciones de prueba",
		inheritanceByCategory: {},
		overrideSummaryByCategory: {},
		snapshotPreviewByCategory: {},
		snapshotVersionIds: [],
		snapshotResolvedAt: "2026-09-30T12:00:00Z",
		contractFacts: {
			cancellationPreset: "Flexible",
			cancellationDeadline: "24 horas antes",
			cancellationPenalty: "Según plazo",
			noShowCharge: "Según contrato",
			paymentTiming: "Al proveedor",
			paymentAmount: "Según reserva",
			paymentGuarantee: "Sin garantía",
			arrivalSchedule: "15:00–11:00",
			arrivalSource: "Hotel",
		},
	}
}

async function render(productType: string, missing: string[] = [], hidden = false) {
	const container = await AstroContainer.create()
	return container.renderToString(RatePlanPoliciesSurface, {
		request: new Request("https://fastt.test/rates/plans/rate-fixture"),
		props: {
			description: "Condiciones",
			policyPlans: [plan(productType, missing)],
			checkIn: "2026-10-01",
			checkOut: "2026-10-02",
			offeringType: productType === "tour" ? "tour" : "accommodation",
			isProfessionalMode: true,
			showHeader: !hidden,
			showPlanSummary: !hidden,
		},
	})
}

describe("rendered rate policy coverage", () => {
	it.each([
		["tour", [], "3/3", 3],
		["tour", ["Payment"], "2/3", 3],
		["hotel", [], "4/4", 4],
		["hotel", ["Payment"], "3/4", 4],
	] as const)(
		"renders %s with missing %s and coverage %s",
		async (business, missing, label, total) => {
			const html = await render(business, [...missing])
			expect(html).toContain(`${label} categorías`)
			expect((html.match(/data-policy-category-row/g) ?? []).length).toBe(total * 2)
			if (missing.length) expect(html).toContain(`${label} completas`)
			else expect(html).toContain('data-contract-sellability="ready"')
			if (business === "tour") expect(html).not.toContain('data-policy-category-row="CheckIn"')
		}
	)

	it("keeps undefined contracts blocked without a misleading fraction", async () => {
		const html = await render("unknown")
		expect(html).toContain("Contrato sin definir")
		expect(html).toContain('data-contract-sellability="blocked"')
		expect(html).not.toContain("0/0")
		expect(html).not.toContain("data-assignment-category=")
	})

	it("hides summary and technical controls in the embedded detail", async () => {
		const html = await render("tour", [], true)
		expect(html).not.toContain('data-role="status-badge"')
		expect(html).not.toContain("data-policy-technical-open=")
		expect(html).not.toContain('data-role="contract-readiness"')
	})
})
