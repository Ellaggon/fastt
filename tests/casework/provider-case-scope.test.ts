import { describe, expect, it } from "vitest"

import {
	parseCommandCenterQueueFilters,
	prioritizeProviderPendingCases,
	summarizeProviderCaseCounts,
} from "@/modules/casework/public"

describe("provider-scoped command-center navigation", () => {
	it("keeps an exact provider when a domain queue is selected", () => {
		const filters = parseCommandCenterQueueFilters(
			"fiscal",
			new URLSearchParams({ providerId: "provider-aventuras", domain: "documents" })
		)

		expect(filters.filters).toMatchObject({
			providerId: "provider-aventuras",
			domain: "fiscal",
		})
	})

	it("does not count another provider and retains an active case older than the recent 100", () => {
		const providerA = summarizeProviderCaseCounts([
			{ domain: "fiscal", status: "resolved", total: 100 },
			// This represents the 101st, older case: it remains active and must stay in the summary.
			{ domain: "fiscal", status: "open", total: 1 },
		])
		const providerB = summarizeProviderCaseCounts([{ domain: "fiscal", status: "open", total: 7 }])

		expect(providerA).toEqual({
			total: 101,
			activeByDomain: { verification: 0, fiscal: 1, documents: 0, payments: 0 },
		})
		expect(providerB.activeByDomain.fiscal).toBe(7)
	})

	it("recommends provider work by SLA, priority and actionability", () => {
		const ordered = prioritizeProviderPendingCases([
			{
				id: "ordinary",
				slaStatus: "running",
				priority: "normal",
				status: "open",
				slaDueAt: new Date("2026-09-12T12:00:00Z"),
				openedAt: new Date("2026-09-01T12:00:00Z"),
			},
			{
				id: "urgent",
				slaStatus: "overdue",
				priority: "low",
				status: "open",
				slaDueAt: new Date("2026-09-03T12:00:00Z"),
				openedAt: new Date("2026-09-02T12:00:00Z"),
			},
			{
				id: "critical",
				slaStatus: "due_soon",
				priority: "critical",
				status: "open",
				slaDueAt: new Date("2026-09-04T12:00:00Z"),
				openedAt: new Date("2026-09-02T12:00:00Z"),
			},
		])

		expect(ordered.map((item) => item.id)).toEqual(["urgent", "critical", "ordinary"])
	})
})
