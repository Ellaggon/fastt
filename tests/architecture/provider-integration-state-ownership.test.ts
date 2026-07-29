import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const taxonomy = readFileSync("docs/engineering/provider-settings-table-taxonomy.md", "utf8")
const schema = readFileSync("src/shared/infrastructure/db/schema/tables.ts", "utf8")

describe("provider integration state ownership", () => {
	it("assigns each operational state to exactly one canonical entity", () => {
		for (const contract of [
			["ProviderIntegrationConnection", "Is the connector usable overall?"],
			["ProviderExternalCalendar", "Is this individual inbound feed usable?"],
			["ProviderIntegrationSyncJob", "What should the worker execute next?"],
			["ProviderIntegrationSyncRun", "What was the durable result of one execution?"],
			["ProviderIntegrationIncident", "Does a technical problem still require action?"],
			["ProviderExternalCalendarConflict", "What decision did the operator make about an overlap?"],
		]) {
			expect(taxonomy).toContain(`\`${contract[0]}\``)
			expect(taxonomy).toContain(contract[1])
		}

		expect(taxonomy).toContain("Propagation is directional")
		expect(taxonomy).toContain("A Conflict never")
	})

	it("keeps ownership intent next to the persisted status columns", () => {
		for (const comment of [
			"Aggregate connector lifecycle",
			"Operational state of this individual inbound feed",
			"Queue lifecycle for pending work",
			"Immutable execution outcome",
			"Lifecycle of an actionable technical problem",
			"Host decision state for an operational overlap alert",
		]) {
			expect(schema).toContain(comment)
		}
	})
})
