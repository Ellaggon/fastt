import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, describe, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
	fail: false,
	items: [] as any[],
	selected: null as any,
	provider: { providerId: "owner" } as any,
}))
vi.mock("@/modules/catalog/public", () => ({
	privateRequestStatuses: ["pending", "accepted", "declined", "expired", "cancelled"],
	listTourPrivateRequests: vi.fn(async () => {
		if (state.fail) throw new Error("read failed")
		return { items: state.items, total: 0, pendingCount: 2, page: 1, pageCount: 1 }
	}),
	findTourPrivateRequest: vi.fn(async () => state.selected),
}))
vi.mock("@/container", () => ({
	productRepository: {
		ensureProductOwnedByProvider: vi.fn(async (id: string) =>
			id === "p1" ? { productType: "Tour" } : null
		),
	},
}))
vi.mock("@/lib/booking/providerOperationalDay", () => ({
	loadProviderOperationalDay: vi.fn(async () => ({
		date: "2026-10-04",
		timezone: "America/La_Paz",
	})),
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	db: {
		select: () => ({
			from: () => ({
				where: () => ({
					orderBy: async () => [
						{ id: "p1", name: "Primer tour" },
						{ id: "p2", name: "Segundo tour" },
					],
				}),
			}),
		}),
	},
}))
import Page from "@/pages/booking/private-requests.astro"
import Detail from "@/components/booking/PrivateRequestDetail.astro"
import Sections from "@/components/booking/BookingSections.astro"
async function render(query: string) {
	const container = await AstroContainer.create()
	return container.renderToResponse(Page, {
		request: new Request(`https://fastt.test/booking/private-requests?${query}`),
		locals: {
			getWorkspaceContext: async () => ({
				user: { id: "user" },
				provider: state.provider,
				sidebarDataPromise: Promise.resolve({ productTypes: ["tour"] }),
			}),
		} as never,
	})
}
const item = {
	request: {
		id: "request-1",
		productId: "p1",
		status: "pending",
		departureDate: "2026-11-01",
		partyJson: { adults: 2, children: 1, infants: 0 },
		contactName: "Ana",
		contactEmail: "ana@example.com",
		contactPhone: null,
		message: "Consulta",
		providerNote: null,
		slaDueAt: new Date("2026-09-30T12:00:00Z"),
	},
	productName: "Primer tour",
	variantName: "Privada",
}
describe("private request workspace", () => {
	beforeEach(() => {
		state.fail = false
		state.items = []
		state.selected = null
		state.provider = { providerId: "owner" }
	})
	it("shows all-tour selection and a global pending count independent of empty filter results", async () => {
		const html = await (await render("status=accepted")).text()
		expect(html).toContain("Todos mis tours")
		expect(html).toContain("2 pendientes")
		expect(html).toContain("No hay solicitudes con estos filtros.")
	})
	it.each(["status=invalid", "page=0", "page=1.5"])("rejects malformed filters %s", async (q) => {
		expect((await render(q)).status).toBe(400)
	})
	it("rejects a foreign product instead of silently selecting all", async () => {
		expect((await render("productId=foreign")).status).toBe(404)
	})
	it("rejects a foreign request instead of showing another request", async () => {
		expect((await render("requestId=foreign")).status).toBe(404)
	})
	it("keeps a selected accepted request visible in Pending after saving", async () => {
		state.selected = { ...item, request: { ...item.request, status: "accepted" } }
		const html = await (await render("status=pending&requestId=request-1&result=accepted")).text()
		expect(html).toContain("Decisión guardada")
		expect(html).toContain("Primer tour")
		expect(html).not.toContain("Aceptar solicitud")
	})
	it("shows retry rather than an empty state after a read failure", async () => {
		state.fail = true
		const html = await (await render("")).text()
		expect(html).toContain("No pudimos cargar")
		expect(html).toContain("Reintentar")
		expect(html).not.toContain("No tienes solicitudes pendientes")
	})
	it("preserves an owned contextual return and removes an external return", async () => {
		const html = await (await render("productId=p1&returnTo=%2Fproduct%2Fp1%2Fdepartures")).text()
		expect(html).toContain('name="returnTo"')
		expect(html).toContain("Volver al tour")
		const invalid = await (await render("returnTo=https%3A%2F%2Fevil.test")).text()
		expect(invalid).not.toContain("Volver al tour")
	})
	it("renders plain request management without transaction promises", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Detail, {
			props: { item, timezone: "America/La_Paz" },
		} as never)
		expect(html).toContain("Aceptar esta solicitud no confirma una reserva.")
		expect(html).toContain("Nota de gestión")
		expect(html).toContain("Plazo de respuesta superado")
		expect(html).not.toContain("Nota para el viajero")
		expect(html).not.toContain("SLA:")
	})
	it("shows the tour, option, party and deadline in a compact actionable row", async () => {
		state.items = [item]
		const html = await (await render("status=pending")).text()
		expect(html).toContain("Primer tour")
		expect(html.replace(/<!--.*?-->/gs, "").replace(/\s+/g, " ")).toContain("3 participantes")
		expect(html).toContain("Responder antes de")
		expect(html).toContain("Revisar solicitud")
		expect(html).not.toContain("ana@example.com")
	})

	it("exposes exactly one active section", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Sections, {
			props: { active: "requests", pendingCount: 2 },
		})
		expect(html.match(/aria-current="page"/g)).toHaveLength(1)
	})
	it("preserves the selected tour when moving between bookings and private requests", async () => {
		const container = await AstroContainer.create()
		const html = await container.renderToString(Sections, {
			props: {
				active: "bookings",
				scope: "tour",
				productId: "tour-1",
				variantId: "departure-1",
				vista: "all",
			},
		})
		const normalized = html.replace(/&#38;/g, "&")
		expect(normalized).toContain(
			'href="/booking?scope=tour&productId=tour-1&variantId=departure-1&vista=all"'
		)
		expect(normalized).toContain(
			'href="/booking/private-requests?scope=tour&status=pending&productId=tour-1"'
		)
	})
})
