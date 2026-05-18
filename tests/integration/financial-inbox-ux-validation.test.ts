import { describe, expect, it } from "vitest"

import { actorFilterOptions } from "@/pages/financial/_client/financial-actor-filters"
import {
	primaryQueueOptions,
	primarySummaryQueues,
} from "@/pages/financial/_client/financial-queues"
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
	})

	it("keeps row scanning useful before opening the drawer", () => {
		for (const entry of financialOperationalWorld) {
			const row = rowForOperationalCase(entry)
			const html = renderOperationalRow(entry)
			expect(row.title, `${entry.id} title`).toBeTruthy()
			expect(row.ownerLabel, `${entry.id} owner`).toBeTruthy()
			expect(row.nextAction, `${entry.id} next action`).toBeTruthy()
			expect(row.blocker, `${entry.id} blocker`).toBeTruthy()
			expect(html, `${entry.id} rendered row`).toContain("Open case")
			expect(html, `${entry.id} expected signal`).toContain(entry.expectedHumanSignal)
		}
	})

	it("keeps primary controls human-first and moves advanced/debug language out of the main inbox", () => {
		expect(primarySummaryQueues.map((queue) => queue.label)).toEqual([
			"Needs attention",
			"Waiting on someone else",
			"Stuck until fixed",
			"Can be closed",
			"Closed recently",
		])
		expect(primarySummaryQueues.some((queue) => /advanced|debug|queue/i.test(queue.label))).toBe(
			false
		)
		expect(primaryQueueOptions.find((option) => option.value === "advanced_all")?.label).toBe(
			"All records (advanced)"
		)
		expect(actorFilterOptions.map((option) => option.label)).toContain("Proof comparison")
		expect(actorFilterOptions.map((option) => option.label)).toContain("Provider payable checks")
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
		expect(visibleText(rowTextFor("payment-proof-missing"))).toContain("Payment proof is missing.")
		expect(visibleText(rowTextFor("waiting-provider-response"))).toContain(
			"Waiting on someone else"
		)
		expect(visibleText(rowTextFor("provider-payable-blocked"))).toContain(
			"Provider payable check is stuck"
		)
		expect(visibleText(rowTextFor("statement-needs-another-look"))).toContain(
			"Statement draft needs another look"
		)
		expect(visibleText(rowTextFor("ready-to-close"))).toContain("Can be closed")
	})
})
