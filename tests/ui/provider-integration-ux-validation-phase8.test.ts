import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integration UX validation phase 8", () => {
	it("records an allowlisted, secret-free integration journey", () => {
		const telemetry = read("src/lib/provider-integration-ux.ts")
		const endpoint = read("src/pages/api/provider/integrations/ux.ts")
		const client = read("src/pages/provider/settings/integrations/_client/integration-ux-beacon.js")

		expect(telemetry).toContain("IntegrationUxFunnel")
		expect(telemetry).toContain("connector_selected")
		expect(telemetry).toContain("authorization_error")
		expect(telemetry).toContain("mapping_snapshot")
		expect(telemetry).toContain("first_sync_valid")
		expect(telemetry).not.toContain("credentialSecret")
		expect(endpoint).toContain("requireProvider")
		expect(endpoint).toContain('"Cache-Control": "no-store"')
		expect(client).not.toContain("FormData")
		expect(client).not.toContain("localStorage")
	})

	it("measures selection, mature abandonment, mappings and first valid sync", () => {
		const telemetry = read("src/lib/provider-integration-ux.ts")
		const admin = read("src/pages/api/admin/providers/integration-ux.ts")
		const script = read("src/scripts/query-provider-integration-ux.ts")
		const pkg = read("package.json")

		expect(telemetry).toContain("timeToChoose")
		expect(telemetry).toContain("abandonmentRatePercent")
		expect(telemetry).toContain("maturityMinutes")
		expect(telemetry).toContain("medianPending")
		expect(telemetry).toContain("firstValidSync")
		expect(admin).toContain("requireInternalAdmin")
		expect(script).toContain("summarizeProviderIntegrationUx")
		expect(pkg).toContain('"query:integration-ux"')
	})

	it("loads the beacon throughout Integrations and emits mapping snapshots", () => {
		const layout = read("src/layouts/ProviderIntegrationsLayout.astro")
		const mapping = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)

		expect(layout).toContain("integration-ux-beacon.js")
		expect(mapping).toContain("integration:mapping-snapshot")
		expect(mapping).toContain("integration:mappings-saved")
	})

	it("supports mobile progress and keyboard tab navigation", () => {
		const wizard = read("src/pages/provider/settings/integrations/connect/channel-manager.astro")
		const mapping = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/mapping.astro"
		)

		expect(wizard).toContain('class="max-w-full overflow-x-auto pb-1"')
		expect(wizard).toContain("focus-within:ring-2")
		expect(mapping).toContain('event.key === "ArrowRight"')
		expect(mapping).toContain('event.key === "ArrowLeft"')
		expect(mapping).toContain('event.key === "Home"')
		expect(mapping).toContain('event.key === "End"')
		expect(mapping).toContain('select.setAttribute(\n\t\t\t\t\t"aria-label"')
	})
})
