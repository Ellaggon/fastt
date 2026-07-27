import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("S0-2 settings hub SSR readiness contract", () => {
	it("server-renders readiness/CTA and no longer ships a lying zero skeleton", () => {
		const page = read("src/pages/provider/settings/index.astro")
		const hydration = read("src/pages/provider/settings/_client/settings-summary-hydration.js")

		expect(page).toContain("buildProviderSettingsSummary")
		expect(page).toContain("primaryCtaHref")
		expect(page).toContain("primaryCtaLabel")
		expect(page).toContain("secondaryCtaHref")
		expect(page).toContain("secondaryCtaLabel")
		expect(page).toContain("settings-summary-bootstrap")
		expect(page).toContain("data-settings-readiness")
		expect(page).toContain("data-settings-coach")
		expect(page).not.toContain('progressLabel = "Cargando estado operativo..."')
		expect(page).not.toContain("const progressPercent = 0")
		expect(page).not.toContain("const blockers: any[] = []")

		expect(hydration).toContain("readBootstrapSummary")
		expect(hydration).toContain("hydrateSummary(bootstrapSummary)")
		expect(hydration).toContain('if (!bootstrapSummary && "requestIdleCallback" in window)')
		expect(hydration).toContain("loadDiagnosticsOnOpen")
		expect(hydration).toContain('loadSettingsSummary({ scope: "full", renderDiagnostics: true })')
		expect(hydration).not.toContain("Qué bloquea qué")
		expect(hydration).toContain("data-settings-blocking-matrix")
		expect(hydration).toContain("data-settings-audit")
		expect(hydration).toContain("data-settings-secondary-cta")
	})

	it("does not fetch summary again when SSR bootstrap is already present", () => {
		const hydration = read("src/pages/provider/settings/_client/settings-summary-hydration.js")
		const calls = {
			fetch: 0,
			idle: 0,
			timeout: 0,
			dispatched: 0,
		}
		const bootstrap = {
			provider: { displayName: "Aventuras del Sur" },
			blockers: [],
			risks: [],
			progress: { message: "Base lista.", progressPercent: 100 },
			counts: {},
			capabilities: {},
			readiness: [],
			actions: {},
		}
		const documentStub = {
			getElementById(id: string) {
				if (id !== "settings-summary-bootstrap") return null
				return { textContent: JSON.stringify(bootstrap) }
			},
			querySelector() {
				return null
			},
			querySelectorAll() {
				return []
			},
			dispatchEvent() {
				calls.dispatched += 1
				return true
			},
		}
		class ElementStub {}
		class DetailsStub {}
		class CustomEventStub {
			type: string
			constructor(type: string) {
				this.type = type
			}
		}
		const windowStub = {
			requestIdleCallback() {
				calls.idle += 1
			},
			setTimeout() {
				calls.timeout += 1
			},
		}
		const fetchStub = () => {
			calls.fetch += 1
			return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
		}

		new Function(
			"document",
			"window",
			"fetch",
			"HTMLDetailsElement",
			"HTMLElement",
			"CustomEvent",
			hydration
		)(documentStub, windowStub, fetchStub, DetailsStub, ElementStub, CustomEventStub)

		expect(calls.dispatched).toBe(1)
		expect(calls.fetch).toBe(0)
		expect(calls.idle).toBe(0)
		expect(calls.timeout).toBe(0)
	})
})
