import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("provider integration certification workspace", () => {
	it("keeps the certification workflow inside Fastt with real surfaces and evidence export", () => {
		const page = read("src/pages/provider/settings/integrations/certification.astro")

		expect(page).toContain("Checklist de escenarios")
		expect(page).toContain("InitialAriSyncPanel")
		expect(page).toContain("certificationId={certification.id}")
		expect(page).toContain("Imprimir / guardar PDF")
		expect(page).toContain("Paquete JSON")
		expect(page).toContain("routes.providerSettingsIntegrationMapping")
		expect(page).toContain("routes.ratesCalendar()")
		expect(page).toContain("routes.inventory()")
		expect(page).toContain('key: "booking_crs"')
		expect(page).toContain("Booking CRS en Channex staging")
		expect(page).toContain("assertProviderIntegrationCertificationExecution")
		expect(page).not.toContain("api.supabase")
		expect(page).not.toContain("postman.com")
	})

	it("records operator evidence as an audited reference and does not bypass certification permission", () => {
		const policy = read("src/lib/provider-integration-certification.ts")
		const endpoint = read(
			"src/pages/api/provider/integrations/certifications/[certificationId]/evidence.ts"
		)

		expect(policy).toContain("providerIntegrationCertificationScenarioKeys")
		expect(policy).toContain('"booking_crs"')
		expect(policy).toContain("recordProviderIntegrationCertificationScenarioEvidence")
		expect(policy).toContain("provider.integration.certification.evidence_recorded")
		expect(endpoint).toContain("assertProviderIntegrationCertificationExecution")
		expect(endpoint).toContain("Content-Disposition")
	})

	it("passes the certification session to the real full-sync endpoint", () => {
		const panel = read("src/components/provider/integrations/InitialAriSyncPanel.astro")

		expect(panel).toContain("certificationId?: string | null")
		expect(panel).toContain("data-certification-id")
		expect(panel).toContain("JSON.stringify(certificationId ? { certificationId } : {})")
	})
})
