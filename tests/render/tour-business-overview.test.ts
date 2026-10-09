import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
	counts: vi.fn(),
	sessions: vi.fn(),
	day: vi.fn(),
	requests: vi.fn(),
	bookings: vi.fn(),
	preparation: vi.fn(),
}))
vi.mock("@/lib/catalog/providerTourCatalog", () => ({ countProviderTours: mocks.counts }))
vi.mock("@/lib/onboarding/preparationSession", () => ({
	listActivePreparationSessions: mocks.sessions,
}))
vi.mock("@/lib/booking/providerOperationalDay", () => ({ loadProviderOperationalDay: mocks.day }))
vi.mock("@/modules/catalog/public", () => ({
	countPendingTourPrivateRequests: mocks.requests,
}))
vi.mock("@/modules/booking/public", () => ({
	bookingOperationsQueryRepository: { listByProvider: mocks.bookings },
}))
vi.mock("@/lib/playbook/summarize-product-preparation", () => ({
	summarizeProductPreparation: mocks.preparation,
}))
import Overview from "@/components/dashboard/TourBusinessOverview.astro"

beforeEach(() => {
	vi.clearAllMocks()
	mocks.counts.mockResolvedValue({ total: 3, published: 1, draft: 2 })
	mocks.sessions.mockResolvedValue([
		{
			productId: "draft",
			productName: "Último tour",
			href: "/product/draft/content?playbook=launch-tour&step=content&flow=create",
		},
	])
	mocks.day.mockResolvedValue({ date: "2026-10-04", timezone: "America/La_Paz" })
	mocks.requests.mockResolvedValue(2)
	mocks.bookings.mockResolvedValue({
		items: [
			{
				bookingId: "booking",
				guestName: "Ana",
				productName: "Tour activo",
				departureTime: "09:00",
			},
		],
		pagination: { total: 42 },
	})
	mocks.preparation.mockResolvedValue({
		isPublished: false,
		continuePreparationHref: "/product/draft/content?playbook=launch-tour&step=content&flow=create",
		tourPresentation: {
			preparation: { complete: false },
			catalogStatus: { label: "En preparación" },
			support: "Completa las fotos",
			stages: [
				{
					id: "photos",
					state: "pending",
					href: "/product/draft/images?playbook=launch-tour&step=images&flow=create&tourFlowVersion=2",
				},
			],
			primaryAction: {
				label: "Continuar ficha",
				href: "/product/draft/images?playbook=launch-tour&step=images&flow=create&tourFlowVersion=2",
			},
			blockers: [],
		},
	})
})
async function render() {
	const container = await AstroContainer.create()
	return container.renderToString(Overview, {
		props: {
			providerId: "provider",
			userId: "user",
			providerNotice: {
				label: "Identidad pendiente",
				href: "/provider/settings/verification?line=tour",
			},
		},
		request: new Request("https://fastt.test/dashboard"),
	})
}
it("shows one resumption and operational totals independent of drafts or the four-row preview", async () => {
	const html = await render()
	expect(html).toContain("3 tours · 1 publicados · 2 borradores")
	expect(html.match(/data-tour-resume/g)).toHaveLength(1)
	expect(html).not.toContain("data-dashboard-product-card")
	expect(html).toContain("Ana")
	expect(html).toMatch(/>\s*42\s*</)
	expect(mocks.bookings).toHaveBeenCalledWith({
		providerId: "provider",
		vertical: "tour",
		status: "confirmed",
		departureDate: "2026-10-04",
		limit: 4,
	})
	expect(mocks.sessions).toHaveBeenCalledWith("provider", "user", { vertical: "tour", limit: 1 })
	expect(html).toContain("tourFlowVersion=2")
})
it("does not invent a last tour when there is no saved session", async () => {
	mocks.sessions.mockResolvedValue([])
	const html = await render()
	expect(html).not.toContain("data-tour-resume")
	expect(mocks.preparation).not.toHaveBeenCalled()
	expect(html).toContain("Ver mis tours")
})
it("offers creation for an empty business", async () => {
	mocks.counts.mockResolvedValue({ total: 0, published: 0, draft: 0 })
	mocks.sessions.mockResolvedValue([])
	const html = await render()
	expect(html).toContain("Crea tu primer tour")
	expect(html).not.toContain("Reservas confirmadas para hoy")
})
it("keeps failed operational queries visibly unknown", async () => {
	mocks.bookings.mockRejectedValue(new Error("offline"))
	mocks.requests.mockRejectedValue(new Error("offline"))
	const html = await render()
	expect(html).toContain("No disponible")
	expect(html).not.toContain("No hay reservas confirmadas para hoy")
})
it("cannot show an inferred day when the provider timezone cannot be loaded", async () => {
	mocks.day.mockRejectedValue(new Error("offline"))
	const html = await render()
	expect(mocks.bookings).not.toHaveBeenCalled()
	expect(html).toContain("No disponible")
})
