import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S4-2 settings hub coach slim", () => {
	it("exposes one next-step coach with primary + secondary CTAs", () => {
		const page = read("src/pages/provider/settings/index.astro")
		const summary = read("src/lib/provider-settings-summary.ts")
		const hydration = read("src/pages/provider/settings/_client/settings-summary-hydration.js")

		expect(page).toContain("data-settings-coach")
		expect(page).toContain("data-settings-next-step")
		expect(page).toContain("data-settings-primary-cta")
		expect(page).toContain("data-settings-secondary-cta")
		expect(page).toContain("Próximo paso")
		expect(page).toContain('id="estado-cuenta"')
		expect(page).toContain("data-settings-capabilities-strip")
		expect(page).toContain("data-settings-details-risks")
		expect(page).toContain("data-settings-details-counts")
		expect(page).toContain("data-settings-details-ops")

		expect(summary).toContain("secondaryCtaLabel")
		expect(summary).toContain("secondaryCtaAction")
		expect(summary).toContain("resolveTrustAlignedHubCoach")
		expect(summary).toContain("coachLabel")
		expect(summary).toContain("coachBody")
		expect(summary).toContain("#estado-cuenta")

		expect(hydration).toContain("data-settings-secondary-cta")
		expect(hydration).toContain("data-settings-next-step-label")
		expect(hydration).toContain("coachLabel")
		expect(hydration).toContain("coachBody")
		expect(hydration).toContain("Aún no hay estado de tu cuenta disponible.")
		expect(hydration).not.toContain("No hay readiness disponible.")
	})

	it("aligns hub coach copy with trust map language", () => {
		const page = read("src/pages/provider/settings/index.astro")
		const trust = read("src/lib/provider-trust-map.ts")

		expect(page).toContain("coachLabel")
		expect(page).toContain("coachBody")
		expect(page).toContain("mapa de confianza")

		expect(trust).toContain("resolveTrustAlignedHubCoach")
		expect(trust).toContain("Perfil: completa la razón social")
		expect(trust).toContain("Negocio: faltan documentos mínimos")
		expect(trust).toContain("Fiscal: verifica NIT/TIN")
		expect(trust).toContain("Pagos: verifica cuenta de cobro")
		expect(trust).toContain("Identidad: cuenta en revisión")
	})

	it("uses human readiness labels without KYC / smoke jargon", () => {
		const governance = read("src/lib/provider-governance.ts")
		expect(governance).toContain('label: "Datos del negocio"')
		expect(governance).toContain('label: "Documentos mínimos verificados"')
		expect(governance).toContain('label: "Cuenta para cobrar verificada"')
		expect(governance).toContain('label: "Equipo y permisos listos"')
		expect(governance).not.toContain("Documentos KYC mínimos verificados")
		expect(governance).not.toContain("smoke test exitoso")
		expect(governance).toContain("Aún no hay conectores con prueba de sync exitosa")
		expect(governance).toContain("Faltan documentos mínimos verificados")
	})
})

describe("S6-4 Hub density — one job above fold with blocker", () => {
	it("collapses capabilities strip and workspace prefs when hasBlockers", () => {
		const page = read("src/pages/provider/settings/index.astro")

		expect(page).toContain("const hasBlockers = blockers.length > 0")
		expect(page).toContain('data-settings-hub-density={hasBlockers ? "blocker" : "clear"}')
		expect(page).toContain("data-settings-details-capabilities")
		expect(page).toContain("data-settings-details-prefs")
		expect(page).toContain("data-settings-estado-min")
		expect(page).toContain("open={!hasBlockers}")
		expect(page).toContain("hasBlockers ? (")
		expect(page).toContain("Capacidades y conteo de bloqueos")
		expect(page).toContain("data-settings-next-step")
		expect(page).toContain("data-settings-primary-cta")
		expect(page).toContain('id="estado-cuenta"')
		// Prefs live in details, not a always-open section header stack
		expect(page).not.toMatch(
			/<section class="space-y-4">\s*<header class="space-y-1">\s*<h2[^>]*>Preferencias del espacio de trabajo/
		)
	})
})
