import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ canOffer: true, canRead: true, rows: [] as unknown[][] }))
vi.mock("@/lib/auth/internal-authorization", () => ({
	requireInternalPermission: vi.fn(async () => {
		if (!mocks.canRead) throw new Response("Forbidden", { status: 403 })
		return { user: { id: "reviewer" } }
	}),
	principalHasPermission: () => mocks.canOffer,
}))
vi.mock("@/lib/commercial-policy/admin-agreement-surface", () => ({
	loadAdminAgreementSurface: vi
		.fn()
		.mockResolvedValue({ collectionModel: "property_collect", label: "Propuesta solicitada" }),
}))
vi.mock("@/shared/infrastructure/db/compat", async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>()
	const query: Record<string, unknown> = {}
	for (const key of ["from", "innerJoin", "where", "orderBy", "limit"]) query[key] = () => query
	query.then = (resolve: (rows: unknown[]) => void) => resolve(mocks.rows.shift() ?? [])
	return { ...original, db: { select: () => query } }
})
import Page from "@/pages/admin/commercial-agreements.astro"
beforeEach(() => {
	vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "prepare")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_PROVIDER_IDS", "provider-fixture")
	vi.stubEnv("FASTT_TOUR_AGREEMENT_APPROVAL_REFERENCE", "render-fixture-review")
	mocks.canOffer = true
	mocks.canRead = true
	mocks.rows = [
		[
			{
				name: "Proveedor ficticio",
				agreement: {
					id: "agreement-fixture",
					providerId: "provider-fixture",
					status: "requested",
					version: 1,
					termsJson: null,
					caseId: "case-fixture",
				},
			},
		],
		[{ providerId: "provider-fixture", userId: "signer", email: "signer@fastt.test" }],
	]
})
afterEach(() => vi.unstubAllEnvs())
async function render() {
	return (await AstroContainer.create()).renderToString(Page, {
		request: new Request(
			"https://fastt.test/admin/commercial-agreements?providerId=provider-fixture"
		),
	})
}
describe("admin commercial agreement editor", () => {
	it("returns 404 before consuming a schema query when disabled", async () => {
		vi.stubEnv("FASTT_TOUR_AGREEMENT_MODE", "off")
		const response = await (
			await AstroContainer.create()
		).renderToResponse(Page, {
			request: new Request(
				"https://fastt.test/admin/commercial-agreements?providerId=provider-fixture"
			),
		})
		expect(response.status).toBe(404)
		expect(mocks.rows).toHaveLength(2)
	})
	it("does not reveal contract data without read permission", async () => {
		mocks.canRead = false
		const container = await AstroContainer.create()
		const response = await container.renderToResponse(Page, {
			request: new Request(
				"https://fastt.test/admin/commercial-agreements?providerId=provider-fixture"
			),
		})
		expect(response.status).toBe(403)
		expect(await response.text()).not.toContain("Proveedor ficticio")
	})
	it("offers local review before authorization, keeping contractual acceptance out of admin", async () => {
		const html = await render()
		expect(html).toContain("Revisar propuesta")
		expect(html).toContain("Autorizar y enviar propuesta")
		expect(html).toMatch(/hidden[^>]*data-proposal-review/)
		expect(html).toContain("signer@fastt.test")
		expect(html).toContain("Representación y autorización")
		expect(html).not.toContain('value="accept"')
		expect(html).toContain("Volver al proveedor")
		expect(html).toContain(
			"/admin/cases/case-fixture?returnTo=%2Fadmin%2Fcommercial-agreements%3FproviderId%3Dprovider-fixture"
		)
	})
	it("makes read-only permission explicit and hides the editor", async () => {
		mocks.canOffer = false
		const html = await render()
		expect(html).toContain("Se requiere permiso de aprobación financiera")
		expect(html).not.toContain("data-proposal-form")
		expect(html).not.toContain("Confirmar retirada")
	})
})
