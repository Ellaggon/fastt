import { describe, expect, it } from "vitest"
import {
	FISCAL_ASSIGNMENT_STRATEGY,
	FISCAL_SCOPE_PRECEDENCE,
	auditFiscalityConfiguration,
	fiscalDefinitionLifecycleStatus,
	readFiscalJurisdictionCountry,
} from "@/modules/taxes-fees/public"
import type { TaxFeeAssignment, TaxFeeDefinition } from "@/modules/taxes-fees/public"

const now = new Date("2026-08-11T12:00:00.000Z")

function definition(partial: Partial<TaxFeeDefinition>): TaxFeeDefinition {
	return {
		id: partial.id ?? "definition",
		providerId: partial.providerId ?? "provider-1",
		code: partial.code ?? "VAT",
		name: partial.name ?? "IVA",
		kind: partial.kind ?? "tax",
		calculationType: partial.calculationType ?? "percentage",
		value: partial.value ?? 10,
		currency: partial.currency ?? null,
		inclusionType: partial.inclusionType ?? "excluded",
		appliesPer: partial.appliesPer ?? "stay",
		priority: partial.priority ?? 0,
		jurisdictionJson:
			partial.jurisdictionJson === undefined ? { country: "CL" } : partial.jurisdictionJson,
		effectiveFrom: partial.effectiveFrom ?? null,
		effectiveTo: partial.effectiveTo ?? null,
		status: partial.status ?? "active",
		editingState: partial.editingState,
		createdAt: partial.createdAt ?? now,
		updatedAt: partial.updatedAt ?? now,
	}
}

function assignment(partial: Partial<TaxFeeAssignment>): TaxFeeAssignment {
	return {
		id: partial.id ?? "assignment",
		taxFeeDefinitionId: partial.taxFeeDefinitionId ?? "definition",
		scope: partial.scope ?? "product",
		scopeId: partial.scopeId ?? "product-1",
		channel: partial.channel ?? null,
		status: partial.status ?? "active",
		createdAt: partial.createdAt ?? now,
	}
}

describe("fiscality phase 0 contract", () => {
	it("documents the current additive resolution and scope explanation order", () => {
		expect(FISCAL_ASSIGNMENT_STRATEGY).toBe("accumulate")
		expect(FISCAL_SCOPE_PRECEDENCE).toEqual([
			"rate_plan",
			"variant",
			"product",
			"provider",
		])
	})

	it("derives the official lifecycle without persisting a new schema", () => {
		expect(fiscalDefinitionLifecycleStatus({ definition: definition({}), assignments: [], now })).toBe("draft")
		expect(
		fiscalDefinitionLifecycleStatus({
			definition: definition({}),
			assignments: [assignment({ status: "archived" })],
			now,
		})
	).toBe("paused")
		expect(
		fiscalDefinitionLifecycleStatus({ definition: definition({}), assignments: [assignment({})], now })
	).toBe("active")
		expect(
		fiscalDefinitionLifecycleStatus({
			definition: definition({ effectiveFrom: new Date("2026-08-12T00:00:00.000Z") }),
			assignments: [assignment({})],
			now,
		})
	).toBe("scheduled")
		expect(
		fiscalDefinitionLifecycleStatus({
			definition: definition({ effectiveTo: new Date("2026-08-10T00:00:00.000Z") }),
			assignments: [assignment({})],
			now,
		})
	).toBe("expired")
		expect(
		fiscalDefinitionLifecycleStatus({ definition: definition({ status: "archived" }), assignments: [assignment({})], now })
	).toBe("archived")
		expect(
		fiscalDefinitionLifecycleStatus({ definition: definition({}), assignments: [assignment({})], hasConflict: true, now })
	).toBe("conflict")
	})

	it("reports migration risks without changing definitions or assignments", () => {
		const activeUnassigned = definition({ id: "unassigned", name: "Sin alcance", jurisdictionJson: null })
		const duplicated = definition({ id: "duplicated", name: "Duplicada" })
		const duplicateAssignments = [
			assignment({ id: "a1", taxFeeDefinitionId: "duplicated" }),
			assignment({ id: "a2", taxFeeDefinitionId: "duplicated" }),
		]
		const audit = auditFiscalityConfiguration({
			definitions: [activeUnassigned, duplicated],
			assignments: duplicateAssignments,
			now,
		})

		expect(audit.summary).toMatchObject({
			definitions: 2,
			activeWithoutAssignment: 1,
			duplicateActiveAssignments: 1,
			definitionsMissingJurisdiction: 1,
		})
		expect(audit.findings.map((finding) => finding.code)).toEqual([
			"duplicate_active_assignment",
			"active_without_assignment",
			"missing_jurisdiction",
		])
		expect(activeUnassigned.status).toBe("active")
		expect(duplicateAssignments).toHaveLength(2)
	})

	it("does not report missing sales coverage for a draft", () => {
		const draft = definition({
			id: "draft",
			status: "active",
			editingState: "draft",
			jurisdictionJson: null,
		})
		const audit = auditFiscalityConfiguration({ definitions: [draft], assignments: [], now })

		expect(audit.summary.activeWithoutAssignment).toBe(0)
		expect(audit.findings.map((finding) => finding.code)).toEqual(["missing_jurisdiction"])
	})

	it("never resolves a draft into a sellable fiscal result", async () => {
		const { resolveEffectiveTaxFees } = await import(
			"@/modules/taxes-fees/application/use-cases/resolve-effective-tax-fees"
		)
		const draft = definition({ id: "draft", editingState: "draft" })
		const result = await resolveEffectiveTaxFees(
			{
				repo: {
					getProviderIdByProductId: async () => "provider-1",
					listActiveAssignments: async () => [assignment({ taxFeeDefinitionId: "draft" })],
					listDefinitionsByIds: async () => [draft],
				},
			},
			{ providerId: "provider-1" }
		)
		expect(result.definitions).toEqual([])
	})

	it("only accepts a two-letter jurisdiction country", () => {
		expect(readFiscalJurisdictionCountry({ country: "cl" })).toBe("CL")
		expect(readFiscalJurisdictionCountry({ country: "Chile" })).toBeNull()
		expect(readFiscalJurisdictionCountry(null)).toBeNull()
	})
})
