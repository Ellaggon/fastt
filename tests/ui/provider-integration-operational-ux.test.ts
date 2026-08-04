import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), "utf8")

describe("provider integration operational UX", () => {
	it("shows the six evidence-backed lifecycle stages", () => {
		const state = read("src/lib/provider-integration-operational-state.ts")
		const lifecycle = read("src/components/provider/integrations/IntegrationLifecycle.astro")

		for (const label of [
			"Acceso validado",
			"Mapeo pendiente",
			"Lista para sincronizar",
			"Sincronización inicial",
			"Operativa",
			"Requiere atención",
		]) {
			expect(state).toContain(label)
		}
		expect(lifecycle).toContain("completedSteps")
		expect(lifecycle).not.toContain("index < 4")
	})

	it("keeps access testing separate from commercial synchronization", () => {
		const panel = read("src/components/provider/integrations/ChannelManagerOperationsPanel.astro")
		const domain = read("src/lib/provider-integrations.ts")
		const syncEndpoint = read("src/pages/api/provider/integrations/[connectorKey]/sync.ts")

		expect(panel).toContain("Probar conexión")
		expect(panel).toContain("no envía inventario, tarifas ni reservas")
		expect(domain).toContain("preservesCommercialAttention")
		expect(syncEndpoint).toContain("result.accessValidated")
	})

	it("provides guarded operational controls and production confirmation", () => {
		const panel = read("src/components/provider/integrations/ChannelManagerOperationsPanel.astro")
		const endpoint = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/operations.ts"
		)
		const production = read(
			"src/pages/api/provider/integrations/channel-manager/connections/[connectionId]/production.ts"
		)

		expect(panel).toContain("Sincronizar cambios ahora")
		expect(panel).toContain("Pausar")
		expect(panel).toContain("Reanudar")
		expect(panel).toContain('name="confirmImpact"')
		expect(endpoint).toContain("requireProviderIntegrationManager")
		expect(endpoint).toContain('action === "sync_now"')
		expect(production).toContain('form?.get("confirmImpact")')
	})

	it("surfaces coverage, timing, warnings and reconnect actions in detail", () => {
		const detail = read(
			"src/pages/provider/settings/integrations/connections/[connectionId]/index.astro"
		)

		expect(detail).toContain("Cobertura de mapping")
		expect(detail).toContain("Último resultado")
		expect(detail).toContain("Próxima ejecución")
		expect(detail).toContain("Advertencias parciales")
		expect(detail).toContain("reconnectHref")
	})
})
