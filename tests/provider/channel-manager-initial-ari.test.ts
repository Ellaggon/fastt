import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
	buildInitialAriWindow,
	INITIAL_ARI_DAYS,
} from "@/lib/channel-manager/channel-manager-initial-ari"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("initial Channex ARI synchronization", () => {
	it("builds an inclusive 500-day window in the property timezone", () => {
		const window = buildInitialAriWindow(new Date("2026-08-04T02:30:00.000Z"), "America/Santiago")

		expect(INITIAL_ARI_DAYS).toBe(500)
		expect(window).toEqual({
			from: "2026-08-03",
			to: "2027-12-15",
			toExclusive: "2027-12-16",
			days: 500,
		})
	})

	it("keeps the full payload ephemeral and persists compact evidence", () => {
		const service = read("src/lib/channel-manager/channel-manager-initial-ari.ts")
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")

		expect(service.match(/adapter\.pushAvailability\(/g)).toHaveLength(1)
		expect(service.match(/adapter\.pushRatesAndRestrictions\(/g)).toHaveLength(1)
		expect(service).toContain('algorithm: "sha256"')
		expect(service).toContain("taskIds")
		expect(service).toContain("availabilityDays")
		expect(service).toContain("rateRestrictionDays")
		expect(schema).toContain('summaryJson: jsonb("summaryJson")')
		expect(schema).not.toContain("snapshotPayloadJson")
	})

	it("exposes one guarded action with live progress and Channex evidence", () => {
		const panel = read("src/components/provider/integrations/InitialAriSyncPanel.astro")
		const endpoint = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/initial-sync.ts"
		)
		const worker = read("src/lib/provider-integration-scheduler.ts")

		expect(panel).toContain("Ejecutar sincronización inicial")
		expect(panel).toContain("Valida el acceso primero")
		expect(panel).toContain("data-progress-bar")
		expect(panel).toContain("Task IDs de Channex")
		expect(endpoint).toContain("requireProviderIntegrationManager")
		expect(endpoint).toContain("enqueueProviderInitialAriSync")
		expect(worker).toContain("job.operation === INITIAL_ARI_OPERATION")
		expect(worker).toContain("job.operation === RECOVERY_FULL_SYNC_OPERATION")
		expect(worker).toContain("updateProviderSyncJobProgress")
	})
})
