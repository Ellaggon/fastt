import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it } from "vitest"

import { providerIntegrationExternalAlertReason } from "@/lib/provider-integration-incident-notifications"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")
const originalEnv = { ...process.env }

afterEach(() => {
	process.env = { ...originalEnv }
})

describe("provider integration observability and recovery", () => {
	it("alerts externally only for blocked bookings or consecutive failures", () => {
		process.env.PROVIDER_INTEGRATION_ALERT_CONSECUTIVE_FAILURES = "3"
		expect(
			providerIntegrationExternalAlertReason({ severity: "error", consecutiveFailures: 1 })
		).toBeNull()
		expect(
			providerIntegrationExternalAlertReason({ severity: "warning", consecutiveFailures: 8 })
		).toBeNull()
		expect(
			providerIntegrationExternalAlertReason({ severity: "error", consecutiveFailures: 3 })
		).toBe("consecutive_failures")
		expect(
			providerIntegrationExternalAlertReason({
				severity: "error",
				entityType: "booking_revision",
				metadataJson: { notificationClass: "booking_blocked" },
				consecutiveFailures: 0,
			})
		).toBe("booking_blocked")
	})

	it("keeps retry and full recovery asynchronous, permissioned and auditable", () => {
		const recovery = read("src/lib/channel-manager/channel-manager-recovery.ts")
		const endpoint = read("src/pages/api/provider/integrations/operations/runs/[runId]/retry.ts")
		const operations = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/operations.ts"
		)
		const scheduler = read("src/lib/provider-integration-scheduler.ts")
		expect(endpoint).toContain("requireProviderIntegrationManager")
		expect(endpoint).toContain("retryProviderIntegrationSyncRun")
		expect(endpoint).toContain("status: 202")
		expect(recovery).toContain('trigger: "retry"')
		expect(recovery).toContain("retryOfRunId")
		expect(recovery).toContain("writeProviderAuditLog")
		expect(operations).toContain('action === "full_recovery_sync"')
		expect(scheduler).toContain("RECOVERY_FULL_SYNC_OPERATION")
	})

	it("exposes actionable recovery controls in the connection UI", () => {
		const history = read("src/components/provider/integrations/IntegrationExecutionPanel.astro")
		const operations = read(
			"src/components/provider/integrations/ChannelManagerOperationsPanel.astro"
		)
		expect(history).toContain("data-retry-run")
		expect(history).toContain("Reintento programado")
		expect(operations).toContain("Full sync de recuperación")
		expect(operations).toContain('data-operation="full_recovery_sync"')
		expect(operations).toContain("500 días")
	})

	it("exports the required operational dimensions and signals", () => {
		const metrics = read("src/lib/provider-integration-operational-metrics.ts")
		for (const dimension of ["provider_id", "property_id", "operation", "result"]) {
			expect(metrics).toContain(dimension)
		}
		for (const metric of [
			"provider_integration_change_delivery_latency_p95_ms",
			"provider_integration_operation_queue_depth",
			"provider_integration_operation_retry_attempts",
			"provider_integration_rate_limit_429_total_24h",
			"provider_integration_partial_rejections_total_24h",
			"provider_integration_booking_revisions_unacknowledged",
		]) {
			expect(metrics).toContain(metric)
		}
	})

	it("deduplicates incidents and resolves recovered booking revisions", () => {
		const operations = read("src/lib/provider-integration-operations.ts")
		const bookings = read("src/lib/channel-manager/channel-manager-booking-revisions.ts")
		expect(operations).toContain("eq(ProviderIntegrationIncident.dedupeKey, dedupeKey)")
		expect(operations).toContain("occurrenceCount")
		expect(bookings).toContain('notificationClass: "booking_blocked"')
		expect(bookings).toContain("resolveProviderIntegrationIncidentsForEntity")
	})
})
