import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integration operations UI", () => {
	it("exposes multiple connections, run history and actionable incidents", () => {
		const wizard = read("src/pages/provider/settings/integrations/connect/channel-manager.astro")
		const mapping = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)
		const activity = read("src/pages/provider/settings/integrations/activity.astro")
		const incidents = read("src/pages/provider/settings/integrations/incidents.astro")
		const connections = read("src/pages/provider/settings/integrations/connections/index.astro")
		expect(activity).toContain("IntegrationExecutionPanel")
		expect(activity).toContain("Carga bajo demanda")
		expect(incidents).toContain("data-integration-incident-summary")
		expect(incidents).toContain("data-integration-incidents-page")
		expect(incidents).toContain("Marcar resuelta")
		expect(incidents).toContain("Aviso enviado")
		expect(incidents).toContain("Sin canal de aviso")
		expect(connections).toContain("data-integration-connections-list")
		expect(wizard).toContain('item.key === "cloudbeds"')
		expect(wizard).toContain('item.key === "channex"')
		expect(mapping).toContain("data-mapping-workspace")
		expect(mapping).toContain("Guardar mapeos")
	})

	it("has provider-owned mutation endpoints for mappings and incidents", () => {
		const mappings = read("src/pages/api/provider/integrations/operations/mappings.ts")
		const incidents = read(
			"src/pages/api/provider/integrations/operations/incidents/[incidentId]/resolve.ts"
		)
		expect(mappings).toContain("requireProvider")
		expect(mappings).toContain("upsertProviderIntegrationMapping")
		expect(mappings).toContain("removeProviderIntegrationMapping")
		expect(incidents).toContain("requireProvider")
		expect(incidents).toContain("resolveProviderIntegrationIncident")
	})

	it("keeps incident categories free of calendar-conflict overlap", () => {
		const operations = read("src/lib/provider-integration-operations.ts")
		expect(operations).toContain("export type IntegrationIncidentCategory")
		expect(operations).toContain('"authentication"')
		expect(operations).toContain('"remote_api"')
		expect(operations).toContain('"mapping"')
		expect(operations).toContain('"data_quality"')
		expect(operations).toContain('"system"')
		expect(operations).not.toMatch(/category:\s*[^\n]*"conflict"/)
		expect(operations).not.toMatch(/IntegrationIncidentCategory\s*=\s*[^;]*"conflict"/)
	})

	it("builds mapping creation from the local catalog and connector presets", () => {
		const page = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)
		const operations = read("src/lib/provider-integration-operations.ts")

		expect(page).toContain("mapping-workspace")
		expect(page).toContain("data-mapping-workspace")
		expect(page).toContain('name="externalEntityId"')
		expect(page).toContain('name="localEntityId"')
		expect(operations).toContain("ProviderIntegrationMappingCatalog")
		expect(operations).toContain("Product")
		expect(operations).toContain("Variant")
		expect(operations).toContain("RatePlan")
		expect(operations).toContain("TaxFeeDefinition")
	})

	it("wires the scheduled integration worker and persistent jobs", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const worker = read("src/lib/provider-integration-scheduler.ts")
		const cron = read("src/pages/api/cron/provider-integrations.ts")
		const vercel = read("vercel.json")
		const domain = read("src/lib/provider-integrations.ts")
		const activityPanel = read(
			"src/components/provider/integrations/IntegrationExecutionPanel.astro"
		)

		expect(schema).toContain("ProviderIntegrationSyncJob")
		expect(schema).toContain("targetType")
		expect(schema).toContain("targetId")
		expect(schema).not.toContain("ProviderExternalCalendarSyncJob")
		expect(schema).toContain('syncEnabled: boolDefault("syncEnabled", false)')
		expect(schema).not.toContain("previewJson")
		expect(schema).not.toContain("lastPreviewAt")
		expect(schema).not.toContain("syncLeaseToken")
		expect(schema).not.toContain("syncLeaseUntil")
		expect(schema).not.toContain("ProviderIntegrationSyncLog")
		expect(domain).toContain("recentActivity")
		expect(domain).toContain("ProviderIntegrationSyncRun")
		expect(domain).toContain("ProviderAuditLog")
		expect(domain).not.toContain("insertIntegrationLog")
		expect(activityPanel).toContain("operationLabel")
		expect(activityPanel).toContain("Procesos pendientes")
		expect(worker).toContain("runScheduledProviderIntegrationSync")
		expect(worker).toContain("claimQueuedProviderSyncJobs")
		expect(worker).toContain('targetType: "connection"')
		expect(worker).toContain("providerIntegrationJobRetryMinutes")
		expect(cron).toContain("verifyCronAuthorization")
		expect(cron).toContain("runScheduledProviderIntegrationSync")
		expect(vercel).toContain("/api/cron/provider-integrations")
	})

	it("sends external notifications for actionable integration incidents", () => {
		const schema = read("src/shared/infrastructure/db/schema/tables.ts")
		const operations = read("src/lib/provider-integration-operations.ts")
		const notifications = read("src/lib/provider-integration-incident-notifications.ts")
		const envExample = read(".env.example")
		const migration = read(
			"db/migrations/2026-08-03_provider_integration_incident_notifications.sql"
		)

		expect(schema).toContain("notificationStatus")
		expect(schema).toContain("notificationChannelsJson")
		expect(schema).toContain("notifiedAt")
		expect(operations).toContain("notifyProviderIntegrationIncident")
		expect(notifications).toContain("sendTransactionalEmail")
		expect(notifications).toContain("PROVIDER_INTEGRATION_INCIDENT_SLACK_WEBHOOK_URL")
		expect(notifications).toContain("PROVIDER_INTEGRATION_INCIDENT_NOTIFICATION_COOLDOWN_MINUTES")
		expect(envExample).toContain("PROVIDER_INTEGRATION_INCIDENT_EMAIL_TO")
		expect(envExample).toContain("PROVIDER_INTEGRATION_INCIDENT_SLACK_WEBHOOK_URL")
		expect(migration).toContain("ProviderIntegrationIncident_notification_status_check")
	})
})
