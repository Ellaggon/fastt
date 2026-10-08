import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, expect, it, vi } from "vitest"
import { presentTourOption, summarizeTourOptions } from "@/lib/tours/tourOptionsWorkspace"
const mocks = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock("@/lib/auth/getUserFromRequest", () => ({
	getUserFromRequest: async () => ({ id: "user" }),
}))
vi.mock("@/lib/auth/getProviderIdFromRequest", () => ({
	getProviderIdFromRequest: async () => "provider",
}))
vi.mock("@/layouts/WorkspaceLayout.astro", async () => import("@/components/ui/Card.astro"))
vi.mock("@/lib/tours/tourOptionsWorkspace", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/tours/tourOptionsWorkspace")>()),
	loadTourOptionsWorkspace: mocks.load,
}))
import Options from "@/pages/product/[id]/departures/index.astro"
const option = presentTourOption({
	productId: "tour",
	published: false,
	profile: {
		id: "option",
		name: "Mañana",
		departureTime: "09:00",
		languageCode: "es",
		maxPax: 8,
		bookingMode: "shared",
		profileActive: false,
	},
	rates: [],
})
beforeEach(() => {
	mocks.load.mockReset()
})
async function render(query = "") {
	const container = await AstroContainer.create()
	return container.renderToString(Options, {
		params: { id: "tour" },
		request: new Request(`https://test/product/tour/departures${query}`),
	})
}
it("empty list has one create action", async () => {
	mocks.load.mockResolvedValue({
		product: { name: "Tour" },
		rows: [],
		summary: summarizeTourOptions([]),
	})
	const html = await render()
	expect(html).toContain("Crear primera opción")
	expect(html).not.toContain("Añadir opción")
})
it("failed read cannot become an empty list", async () => {
	mocks.load.mockRejectedValue(new Error("unavailable"))
	const html = await render()
	expect(html).toContain("No se pudieron comprobar las opciones")
	expect(html).toContain("Reintentar")
	expect(html).not.toContain("Sin opciones todavía")
})
it("only an owned listed option produces a created notice and no duplicate edit action", async () => {
	mocks.load.mockResolvedValue({
		product: { name: "Tour" },
		rows: [option],
		summary: summarizeTourOptions([option]),
	})
	expect(await render("?created=foreign")).not.toContain("Opción creada.")
	const html = await render("?created=option")
	expect(html).toContain("Opción creada.")
	expect(html.match(/Editar opción/g)).toHaveLength(1)
	expect(html).toContain("Deshabilitada")
})
