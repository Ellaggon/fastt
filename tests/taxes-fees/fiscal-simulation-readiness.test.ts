import { describe, expect, it } from "vitest"

import {
	buildFiscalCoverageIssues,
	buildFiscalDefinitionIssues,
	buildFiscalSimulationNotice,
	composeFiscalSimulationReadiness,
	isFiscalDefinitionComplete,
	personalizeCommercialIssues,
	resolveFiscalSimulationTarget,
	type FiscalSimulationDefinitionInput,
} from "@/lib/taxes-fees/fiscal-simulation-readiness"
import type {
	FiscalSimulationIssue,
	FiscalWorkspaceResources,
} from "@/lib/taxes-fees/fiscal-workspace-resources"

const resources: FiscalWorkspaceResources = {
	providerId: "prov-1",
	products: [
		{ id: "hotel-sol", label: "Hotel Sol", kind: "hotel" },
		{ id: "hotel-luna", label: "Hotel Luna", kind: "hotel" },
	],
	variants: [
		{ id: "sol-room", productId: "hotel-sol", label: "Doble", kind: "room" },
		{ id: "luna-room", productId: "hotel-luna", label: "Suite", kind: "room" },
	],
	ratePlans: [
		{
			id: "sol-default",
			productId: "hotel-sol",
			variantId: "sol-room",
			label: "Default",
			isActive: true,
		},
		{
			id: "luna-default",
			productId: "hotel-luna",
			variantId: "luna-room",
			label: "Bar",
			isActive: true,
		},
	],
}

function definition(
	partial: Partial<FiscalSimulationDefinitionInput> = {}
): FiscalSimulationDefinitionInput {
	return {
		id: "fee-1",
		name: "Cargo de limpieza",
		value: 25,
		jurisdictionCountry: "BO",
		assignments: [],
		...partial,
	}
}

function commercialIssue(
	id: FiscalSimulationIssue["id"],
	title: string,
	description: string
): FiscalSimulationIssue {
	return {
		id,
		kind: "commercial",
		title,
		description,
		actionLabel: "Abrir calendario",
		href: "/rates/calendar",
	}
}

describe("fiscal simulation readiness", () => {
	it("treats a rule without jurisdiction as incomplete", () => {
		expect(isFiscalDefinitionComplete(definition({ jurisdictionCountry: "" }))).toBe(false)
		const issues = buildFiscalDefinitionIssues({
			definition: definition({ name: "Cargo de servicio", jurisdictionCountry: "" }),
		})
		expect(issues).toHaveLength(1)
		expect(issues[0]?.id).toBe("missing_jurisdiction")
		expect(issues[0]?.title).toContain("Cargo de servicio")
	})

	it("keeps account-wide and unassigned rules on the workspace product", () => {
		const unassigned = resolveFiscalSimulationTarget({
			definition: definition(),
			resources,
			workspaceProductId: "hotel-sol",
		})
		expect(unassigned.coverage).toBe("none")
		expect(unassigned.preferredProductId).toBe("hotel-sol")
		expect(unassigned.restrictToTarget).toBe(true)
		expect(unassigned.workspaceMismatch).toBe(false)

		const account = resolveFiscalSimulationTarget({
			definition: definition({
				assignments: [{ scope: "provider", scopeId: null, status: "active" }],
			}),
			resources,
			workspaceProductId: "hotel-sol",
		})
		expect(account.coverage).toBe("account")
		expect(account.preferredProductId).toBe("hotel-sol")
	})

	it("follows the assigned product even when the workspace shows another hotel", () => {
		const target = resolveFiscalSimulationTarget({
			definition: definition({
				name: "Cargo de servicio",
				assignments: [{ scope: "product", scopeId: "hotel-luna", status: "active" }],
			}),
			resources,
			workspaceProductId: "hotel-sol",
		})
		expect(target.coverage).toBe("assigned")
		expect(target.preferredProductId).toBe("hotel-luna")
		expect(target.workspaceMismatch).toBe(true)
		expect(target.restrictToTarget).toBe(true)

		const coverage = buildFiscalCoverageIssues({
			definition: definition({ name: "Cargo de servicio" }),
			target,
			workspaceProductId: "hotel-sol",
		})
		expect(coverage[0]?.id).toBe("coverage_other_product")
		expect(coverage[0]?.title).toContain("Hotel Sol")
		expect(coverage[0]?.description).toContain("Hotel Luna")
	})

	it("prefers a rate-plan assignment when the rule is scoped to a tarifa", () => {
		const target = resolveFiscalSimulationTarget({
			definition: definition({
				assignments: [{ scope: "rate_plan", scopeId: "luna-default", status: "active" }],
			}),
			resources,
		})
		expect(target.preferredProductId).toBe("hotel-luna")
		expect(target.preferredRatePlanId).toBe("luna-default")
		expect(target.preferredVariantId).toBe("luna-room")
	})

	it("personalizes commercial copy with the selected rule without changing the catalog object", () => {
		const [issue] = personalizeCommercialIssues(
			[
				commercialIssue(
					"missing_availability",
					"Sin fechas libres en Default",
					"Necesitas dos noches seguidas con cupo para probar el cobro."
				),
			],
			"Cargo de servicio"
		)
		expect(issue?.title).toBe("Sin fechas libres en Default")
		expect(issue?.description).toBe(
			"Necesitas dos noches seguidas con cupo en las próximas cuatro semanas para certificar Cargo de servicio."
		)
	})

	it("names the selected rule in the commercial notice and in the manual fallback", () => {
		const notice = buildFiscalSimulationNotice({
			definitionName: "Cargo de servicio",
			fiscalIssues: [],
			commercialIssues: [
				commercialIssue(
					"missing_price",
					"Sin precio en Default",
					"Pon un precio mayor que cero en esas mismas dos noches seguidas para certificar Cargo de servicio."
				),
			],
		})
		expect(notice?.title).toBe("Falta preparar una cotización real")
		expect(notice?.intro).toContain("Cargo de servicio")
		expect(notice?.footer).toContain("Cargo de servicio")
		expect(notice?.allowsManualFallback).toBe(true)
	})

	it("leads with fiscal copy when the rule itself is incomplete", () => {
		const notice = buildFiscalSimulationNotice({
			definitionName: "Cargo de servicio",
			fiscalIssues: buildFiscalDefinitionIssues({
				definition: definition({ name: "Cargo de servicio", jurisdictionCountry: "" }),
			}),
			commercialIssues: [],
		})
		expect(notice?.title).toBe("Falta completar Cargo de servicio")
		expect(notice?.allowsManualFallback).toBe(false)
	})

	it("keeps the same commercial blockers across rules that share a catalog, but rewrites the copy", () => {
		const commercial = {
			context: null,
			issues: [
				commercialIssue(
					"missing_availability",
					"Sin fechas libres en Default",
					"Necesitas dos noches seguidas con cupo para probar el cobro."
				),
				commercialIssue(
					"missing_price",
					"Sin precio en Default",
					"Pon un precio mayor que cero en dos noches seguidas."
				),
			],
		}
		const cleaning = composeFiscalSimulationReadiness({
			definition: definition({ name: "Cargo de limpieza" }),
			resources,
			commercial,
		})
		const service = composeFiscalSimulationReadiness({
			definition: definition({ name: "Cargo de servicio" }),
			resources,
			commercial,
		})
		expect(cleaning.issues.map((issue) => issue.id)).toEqual(
			service.issues.map((issue) => issue.id)
		)
		expect(cleaning.issues.map((issue) => issue.title)).toEqual(
			service.issues.map((issue) => issue.title)
		)
		expect(cleaning.notice?.intro).toContain("Cargo de limpieza")
		expect(service.notice?.intro).toContain("Cargo de servicio")
		expect(service.issues[0]?.description).toContain("Cargo de servicio")
		expect(cleaning.issues[0]?.description).not.toContain("Cargo de servicio")
	})

	it("does not treat missing assignment as a commercial blocker", () => {
		const ready = composeFiscalSimulationReadiness({
			definition: definition({ assignments: [] }),
			resources,
			commercial: {
				context: {
					productId: "hotel-sol",
					productLabel: "Hotel Sol",
					variantId: "sol-room",
					variantLabel: "Doble",
					ratePlanId: "sol-default",
					ratePlanLabel: "Default",
					channel: "web",
					checkIn: "2026-08-28",
					checkOut: "2026-08-30",
					rooms: 1,
					adults: 2,
					children: 0,
					currency: "USD",
					baseAmount: 200,
					pricingSource: "effective_pricing",
				},
				issues: [],
			},
		})
		expect(ready.issues).toEqual([])
		expect(ready.notice).toBeNull()
		expect(ready.coverageIssues[0]?.id).toBe("unassigned")
		expect(ready.coverageIssues[0]?.description).toContain("Cargo de limpieza")
	})

	it("searches the whole account when there is no workspace product and the rule is unassigned", () => {
		const target = resolveFiscalSimulationTarget({
			definition: definition(),
			resources,
		})
		expect(target.restrictToTarget).toBe(false)
		expect(target.preferredProductId).toBe("hotel-sol")
	})
})
