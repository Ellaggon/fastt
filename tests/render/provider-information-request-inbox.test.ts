import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import ProviderInformationRequestInbox from "@/components/provider/ProviderInformationRequestInbox.astro"
import type { listProviderInformationRequests } from "@/modules/casework/public"

type Item = Awaited<ReturnType<typeof listProviderInformationRequests>>[number]
const item: Item = {
	decisionId: "decision-a",
	caseId: "case-a",
	caseNumber: "CC-100",
	domain: "fiscal",
	status: "waiting_information",
	message: "Actualiza el respaldo fiscal de tu cuenta.",
	publishedAt: new Date("2026-10-16T12:00:00Z"),
	response: null,
	respondedAt: null,
}
async function render(
	requests: Item[],
	overrides: { canReadRequests?: boolean; enabled?: boolean } = {}
) {
	const container = await AstroContainer.create()
	return container.renderToString(ProviderInformationRequestInbox, {
		request: new Request("https://fastt.test/provider/compliance/requests"),
		props: { requests, actorId: "member", enabled: true, canReadRequests: true, ...overrides },
	})
}
describe("provider information-request inbox", () => {
	it("offers a useful empty state without implying account approval", async () => {
		const html = await render([])
		expect(html).toContain("No tienes solicitudes de información")
		expect(html).toContain("no confirma que la cuenta esté aprobada")
		expect(html).toContain('href="/provider/settings/verification"')
		expect(html).toContain('href="/provider/support"')
		expect(html).not.toContain('href="/provider/compliance/requests"')
	})
	it("distinguishes lack of access from an empty authorized inbox", async () => {
		const html = await render([], { canReadRequests: false })
		expect(html).toContain("Tu acceso no incluye solicitudes de revisión")
		expect(html).not.toContain("No tienes solicitudes de información")
	})
	it("connects a pending fiscal request to its correction area and response form", async () => {
		const html = await render([item])
		expect(html).toContain('id="request-group-pending"')
		expect(html).toContain('href="/provider/settings/verification/fiscal"')
		expect(html).toContain('action="/api/provider/compliance/respond"')
		expect(html).toContain('name="decisionId" value="decision-a"')
	})
	it("keeps reading available while replies are disabled", async () => {
		const html = await render([item], { enabled: false })
		expect(html).toContain(item.message)
		expect(html).toContain("Envío de respuestas no disponible")
		expect(html).not.toContain("data-information-response")
	})
	it("shows an answered request in follow-up without allowing a second response", async () => {
		const html = await render([
			{ ...item, status: "in_review", response: "Datos corregidos", respondedAt: new Date() },
		])
		expect(html).toContain('id="request-group-follow_up"')
		expect(html).toContain("Respuesta enviada")
		expect(html).not.toContain("data-information-response")
	})
	it("does not label a resolved case as still awaiting review", async () => {
		const html = await render([
			{ ...item, status: "resolved", response: "Datos corregidos", respondedAt: new Date() },
		])
		expect(html).toContain('id="request-group-closed"')
		expect(html).toContain("Revisión finalizada")
		expect(html).not.toContain("pendiente de revisión")
		expect(html).not.toContain("data-information-response")
	})
})
