import { afterEach, expect, it, vi } from "vitest"

afterEach(() => {
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
	vi.resetModules()
})

async function renderGuide(details: Record<string, unknown>) {
	const summary = { textContent: "Cargando duración y guía..." }
	const root = { dataset: { productId: "tour", isTour: "true" } }
	vi.stubGlobal("document", {
		documentElement: { dataset: {} },
		readyState: "loading",
		addEventListener: vi.fn(),
		querySelector: (selector: string) =>
			selector === "[data-product-summary-config]" ? root : null,
		getElementById: (id: string) => (id === "summaryTourDetails" ? summary : null),
	})
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ productId: "tour", subtype: { details } }),
		})
	)
	vi.spyOn(console, "debug").mockImplementation(() => {})
	const { initProductSummaryHydration } = await import(
		"@/pages/product/_client/product-summary-hydration"
	)
	initProductSummaryHydration()
	await vi.waitFor(() => expect(summary.textContent).not.toContain("Cargando"))
	return summary.textContent
}

it.each([
	[{ guide: { languages: "es" } }, "es"],
	[{ guide: { languages: " es, en; pt\nfr " } }, "es, en, pt, fr"],
	[{ guide: { languages: [" es ", "en", null, 5, ""] } }, "es, en"],
	[{ guideLanguages: ["es", "en"] }, "es, en"],
] as const)("shows saved guide languages for %j", async (details, expected) => {
	const text = await renderGuide(details)
	expect(text).toContain(`Guía: ${expected}`)
	expect(text).not.toContain("Idiomas de guía pendientes")
})

it.each([{}, { guide: null }, { guide: { languages: " , ; " } }, { guide: { languages: {} } }])(
	"keeps an honest pending state when languages are missing: %j",
	async (details) => {
		expect(await renderGuide(details)).toContain("Idiomas de guía pendientes")
	}
)

it("uses canonical guide data before a legacy language field", async () => {
	expect(await renderGuide({ guide: { languages: "es" }, guideLanguages: ["en"] })).toContain(
		"Guía: es"
	)
})
