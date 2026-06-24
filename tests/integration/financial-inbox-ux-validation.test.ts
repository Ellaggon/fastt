import { describe, expect, it } from "vitest"

import { actorFilterOptions } from "@/pages/financial/_client/financial-actor-filters"
import {
	primaryQueueOptions,
	primarySummaryQueues,
} from "@/pages/financial/_client/financial-queues"
import { buildFinancialDrawerViewModel } from "@/pages/financial/_client/financial-drawer-view-model"
import { buildProviderFinanceCopy } from "@/pages/financial/_client/financial-provider-finance-copy"
import { buildFinancialRowViewModel } from "@/pages/financial/_client/financial-row-view-model"
import { buildFinancialStatementViewModel } from "@/pages/financial/_client/financial-statement-view-model"
import {
	filterOperationalWorld,
	financialOperationalWorld,
	financialOperatorDrills,
	renderOperationalRow,
	rowForOperationalCase,
} from "../fixtures/financial-operational-world"

const internalTerms = [
	/\bqueue\b/i,
	/\bstale\b/i,
	/\bfreshness\b/i,
	/\bsnapshot lifecycle\b/i,
	/\bmaterialization\b/i,
	/\breconciliation\b/i,
	/\bprovider finance\b/i,
	/\bblockingDetails\b/,
	/\bnextOperationalAction\b/,
]

function rowTextFor(id: string): string {
	const entry = financialOperationalWorld.find((candidate) => candidate.id === id)
	if (!entry) throw new Error(`missing fixture ${id}`)
	return renderOperationalRow(entry)
}

function visibleText(html: string): string {
	return html
		.replace(/<[^>]*>/g, " ")
		.replace(/\s+/g, " ")
		.trim()
}

describe("integration/financial inbox UX validation", () => {
	it("provides a realistic operational world instead of a clean demo dataset", () => {
		expect(financialOperationalWorld).toHaveLength(8)
		expect(financialOperationalWorld.map((entry) => entry.id)).toEqual([
			"payment-proof-missing",
			"duplicate-provider-reference",
			"stale-review-after-proof-arrived",
			"waiting-provider-response",
			"provider-payable-blocked",
			"statement-needs-another-look",
			"ready-to-close",
			"refund-follow-up-pending",
		])
		expect(new Set(financialOperationalWorld.map((entry) => entry.persona))).toEqual(
			new Set(["financial_ops", "reconciliation_ops", "provider_ops", "support"])
		)
		expect(financialOperationalWorld.some((entry) => entry.urgency === "high")).toBe(true)
	})

	it("answers cold-start operator questions with human inbox facets", () => {
		const needsAttention = filterOperationalWorld({ queue: "needs_action_today" }).map(
			(entry) => entry.id
		)
		const waiting = filterOperationalWorld({ queue: "waiting_external" }).map((entry) => entry.id)
		const stuck = filterOperationalWorld({ queue: "blocked" }).map((entry) => entry.id)
		const closeable = filterOperationalWorld({ queue: "ready_to_close" }).map((entry) => entry.id)

		expect(needsAttention).toContain("payment-proof-missing")
		expect(needsAttention).toContain("refund-follow-up-pending")
		expect(waiting).toEqual(["waiting-provider-response"])
		expect(stuck).toEqual(
			expect.arrayContaining([
				"duplicate-provider-reference",
				"stale-review-after-proof-arrived",
				"provider-payable-blocked",
				"statement-needs-another-look",
			])
		)
		expect(closeable).toContain("ready-to-close")
		expect(filterOperationalWorld({ queue: "collections" }).map((entry) => entry.id)).toContain(
			"payment-proof-missing"
		)
		expect(filterOperationalWorld({ queue: "settlements" }).map((entry) => entry.id)).toEqual(
			expect.arrayContaining(["duplicate-provider-reference", "stale-review-after-proof-arrived"])
		)
		expect(filterOperationalWorld({ queue: "provider_payables" }).map((entry) => entry.id)).toEqual(
			expect.arrayContaining(["provider-payable-blocked", "statement-needs-another-look"])
		)
	})

	it("keeps row scanning useful before opening the drawer", () => {
		for (const entry of financialOperationalWorld) {
			const row = rowForOperationalCase(entry)
			const html = renderOperationalRow(entry)
			expect(row.title, `${entry.id} title`).toBeTruthy()
			expect(row.ownerLabel, `${entry.id} owner`).toBeTruthy()
			expect(row.nextAction, `${entry.id} next action`).toBeTruthy()
			expect(row.blocker, `${entry.id} blocker`).toBeTruthy()
			expect(html, `${entry.id} rendered row`).toContain("Abrir caso")
			expect(html, `${entry.id} expected signal`).toContain(entry.expectedHumanSignal)
		}
	})

	it("keeps primary controls human-first and moves advanced/debug language out of the main inbox", () => {
		expect(primarySummaryQueues.map((queue) => queue.label)).toEqual([
			"Requieren atención",
			"Esperando respuesta",
			"Bloqueados",
			"Listos para cerrar",
			"Cerrados recientemente",
		])
		expect(primarySummaryQueues.some((queue) => /advanced|debug|queue/i.test(queue.label))).toBe(
			false
		)
		expect(primaryQueueOptions.find((option) => option.value === "advanced_all")?.label).toBe(
			"Todos los casos"
		)
		expect(actorFilterOptions.map((option) => option.label)).toContain("Liquidaciones")
		expect(actorFilterOptions.map((option) => option.label)).toContain("Pagos a proveedores")
		expect(primaryQueueOptions.map((option) => option.value)).toEqual(
			expect.arrayContaining([
				"collections",
				"provider_payables",
				"refunds",
				"settlements",
				"exceptions",
			])
		)
	})

	it("derives operational categories, attention state, and money without reading translated copy", () => {
		const collection = rowForOperationalCase(financialOperationalWorld[0]!)
		const settlement = rowForOperationalCase(financialOperationalWorld[1]!)
		const providerPayable = rowForOperationalCase(financialOperationalWorld[4]!)
		const closeable = rowForOperationalCase(financialOperationalWorld[6]!)

		expect(collection).toMatchObject({
			operationalCategory: "collections",
			attentionState: "blocked",
			isBlocked: true,
			amount: 320,
			amountLabel: "Importe del cobro",
		})
		expect(settlement.operationalCategory).toBe("settlements")
		expect(providerPayable).toMatchObject({
			operationalCategory: "provider_payables",
			amount: 390,
			amountLabel: "Pendiente al proveedor",
		})
		expect(closeable).toMatchObject({
			attentionState: "ready_to_close",
			canClose: true,
			isBlocked: false,
		})

		const refund = buildFinancialRowViewModel({
			item: financialOperationalWorld[7]!.item,
			reconciliation: null,
			refundHandoff: { expectedAmount: 125, currency: "USD" },
			referenceCounts: { payment: 1, settlement: 1, refund: 0, invoice: 0 },
			ageLabel: "abierto hace 3 días",
			sourceKind: "persisted",
		})
		expect(refund).toMatchObject({
			operationalCategory: "refunds",
			amount: 125,
			amountLabel: "Reembolso esperado",
		})
	})

	it("builds a contextual drawer instead of rendering every financial section", () => {
		const collectionRow = rowForOperationalCase(financialOperationalWorld[0]!)
		const providerRow = rowForOperationalCase(financialOperationalWorld[4]!)
		const refundRow = rowForOperationalCase(financialOperationalWorld[7]!)

		const collectionDrawer = buildFinancialDrawerViewModel({
			row: collectionRow,
			reconciliationMatch: null,
			evidenceEntries: [],
			duplicateSignals: [],
		})
		const providerDrawer = buildFinancialDrawerViewModel({
			row: providerRow,
			reconciliationMatch: null,
			evidenceEntries: [],
			duplicateSignals: [],
		})
		const refundDrawer = buildFinancialDrawerViewModel({
			row: refundRow,
			reconciliationMatch: null,
			evidenceEntries: [],
			duplicateSignals: [],
		})

		expect(collectionDrawer.sections).toContain("evidence")
		expect(collectionDrawer.sections).not.toContain("refund")
		expect(collectionDrawer.sections).not.toContain("provider_finance")
		expect(collectionDrawer.evidenceGroups.map((group) => group.key)).toEqual([
			"payment",
			"reference",
		])
		expect(providerDrawer.sections).toEqual(
			expect.arrayContaining(["reconciliation", "provider_finance", "statement"])
		)
		expect(providerDrawer.sections).not.toContain("refund")
		expect(refundDrawer.sections).toContain("refund")
		expect(refundDrawer.sections).not.toContain("statement")
		expect(refundDrawer.evidenceGroups.map((group) => group.key)).toEqual(["refund", "reference"])
	})

	it("uses closed Spanish fallbacks for unknown backend states", () => {
		const providerCopy = buildProviderFinanceCopy({
			reconciliation: { readyForPayable: false, blockingStatus: "new_internal_code" },
			statement: { state: "new_internal_state" },
			snapshotLifecycle: { staleReasons: [] },
		})
		const statement = buildFinancialStatementViewModel({
			statement: {
				state: "new_internal_state",
				staleReasons: ["new_internal_reason"],
			},
			reconciliation: { readyForPayable: false },
		})

		expect(providerCopy.reconciliationDependency).toBe("Los importes todavía requieren revisión")
		expect(providerCopy.statementFreshness).toBe("Por confirmar")
		expect(statement.state).toBe("Por confirmar")
		expect(statement.staleReasons).toEqual([
			"El resumen ya no coincide con la información más reciente",
		])
	})

	it("does not let technical taxonomy leak into the operator-facing row language", () => {
		const renderedRows = financialOperationalWorld
			.map((entry) => visibleText(renderOperationalRow(entry)))
			.join("\n")
		const violations = internalTerms.flatMap((pattern) =>
			pattern.test(renderedRows) ? [`rendered row leaked ${pattern}`] : []
		)
		expect(violations).toEqual([])
	})

	it("documents walkthrough drills that cannot be proven by unit tests alone", () => {
		expect(financialOperatorDrills.map((drill) => drill.id)).toEqual([
			"new-operator-cold-start",
			"financial-ops-15-minute-triage",
			"proof-comparison-risk-check",
			"provider-payable-check",
		])
		for (const drill of financialOperatorDrills) {
			expect(drill.prompt).toMatch(/\w/)
			expect(drill.successSignals.length).toBeGreaterThanOrEqual(2)
		}
	})

	it("keeps specific workflow rows understandable for role-play validation", () => {
		expect(visibleText(rowTextFor("payment-proof-missing"))).toContain(
			"Falta el comprobante de cobro."
		)
		expect(visibleText(rowTextFor("waiting-provider-response"))).toContain("Esperando respuesta")
		expect(visibleText(rowTextFor("provider-payable-blocked"))).toContain(
			"Los montos deben revisarse primero"
		)
		expect(visibleText(rowTextFor("statement-needs-another-look"))).toContain(
			"El resumen del proveedor quedó desactualizado"
		)
		expect(visibleText(rowTextFor("ready-to-close"))).toContain("Listo para cerrar")
	})
})
