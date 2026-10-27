import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import ProviderTourCommercialAgreement from "@/components/provider/ProviderTourCommercialAgreement.astro"
import type { AgreementRow, OfferedTerms } from "@/modules/financial/commercial-agreements"
const terms: OfferedTerms = {
	sellerName: "Proveedor ficticio",
	beneficiaryProviderId: "provider-a",
	identityHash: "identity",
	collectionModel: "property_collect",
	timeZone: "America/La_Paz",
	commissionPercent: 12,
	commissionBase: "Precio del servicio cobrado, sin impuestos separados.",
	currency: "USD",
	effectiveFrom: "2026-01-01",
	effectiveTo: "2030-12-31",
	paymentTiming: "El negocio cobra antes de la actividad.",
	cancellationTerms: "Según las condiciones aceptadas al reservar.",
	settlementTerms: "Conciliación mensual con evidencia de cobro.",
	fiscalResponsibilities: "Cada parte documenta sus propios servicios.",
	fullTerms:
		"Contrato ficticio de QA. No constituye una propuesta comercial real ni un compromiso entre partes reales.",
	documentReference: "fixture-only",
}
const row: AgreementRow = {
	id: "agreement-a",
	providerId: "provider-a",
	line: "tour",
	version: 1,
	status: "offered",
	termsJson: terms,
	termsHash: "hash-a",
	authorizedSignerUserId: "signer",
	representationReference: "mandate-fixture",
	requestedByUserId: "manager",
	offeredByUserId: "reviewer",
	offeredAt: new Date(),
	acceptedAt: null,
	acceptedByUserId: null,
	acceptanceHash: null,
	caseId: "case-a",
	createdAt: new Date(),
	updatedAt: new Date(),
}
const defaults = {
	enabled: true,
	readFailed: false,
	resolvedAgreementId: null as string | null,
	acceptedStatus: undefined as string | undefined,
	experiences: [] as { id: string; name: string | null }[],
	agreements: [] as AgreementRow[],
	collectionModel: "undecided",
	canEdit: true,
	userId: "signer",
	agreementStatus: "acceptance_required",
	sellerName: "Proveedor ficticio",
}
async function render(props: Partial<typeof defaults>) {
	const container = await AstroContainer.create()
	return container.renderToString(ProviderTourCommercialAgreement, {
		props: { ...defaults, ...props },
	})
}
describe("provider agreement actions", () => {
	it("keeps per-offer readiness and self-referential diagnostic actions out of Tours settings", () => {
		const page = readFileSync("src/pages/provider/settings/payments.astro", "utf8")
		expect(page).toMatch(
			/const model = showTourAgreement\s*\? null\s*:\s*await loadProviderContractSurface/
		)
		expect(page).not.toContain("Estado de esta experiencia")
		expect(page).toContain("enabled={agreementEnabled}")
		expect(page).toContain("readFailed={agreementReadFailed}")
		expect(page).toContain("{model && <ProviderCommercialContractCard model={model} />}")
	})
	it("starts with the collection declaration rather than an unavailable agreement acceptance", async () => {
		const html = await render({})
		expect(html).toContain("Confirmar cobro directo")
		expect(html).toContain("Primero confirma quién cobra")
		expect(html).not.toContain("El negocio cobra directamente")
		expect(html).not.toContain('name="action" value="request"')
		expect(html).not.toContain("Aceptar acuerdo")
		expect(html).not.toContain('name="consent"')
	})
	it("places the request beside the proposal after collection is confirmed", async () => {
		const html = await render({ collectionModel: "property_collect" })
		expect(html).toContain("Solicitar propuesta")
		expect(html).toContain("Tu negocio cobra al viajero")
		expect(html).toContain("Declarado")
		expect(html).not.toContain("Confirmar cobro directo")
		expect(html).not.toContain(">Confirmación<")
	})
	it("keeps disabled contracting distinct from a pending review without exposing write actions", async () => {
		const html = await render({ enabled: false, collectionModel: "property_collect" })
		expect(html).toContain("Contratación pendiente de habilitación")
		expect(html).not.toContain("Modalidad y requisitos por oferta")
		expect(html).not.toContain("Pendiente de Fastt")
		expect(html).not.toContain("data-agreement-form")
		expect(html).not.toContain("Contratación no habilitada")
		expect(html).not.toContain("fastt-notice")
		expect(html).toContain("data-agreement-unavailable")
		expect(html).toContain("commercial-agreement__surface")
		expect(html.match(/class="fastt-card /g)).toHaveLength(1)
	})
	it("fails closed on an agreement read error instead of offering a duplicate request", async () => {
		const html = await render({
			readFailed: true,
			collectionModel: "property_collect",
			agreements: [row],
		})
		expect(html).toContain("No pudimos cargar el acuerdo")
		expect(html).toContain("Volver a comprobar")
		expect(html).not.toContain("data-agreement-form")
	})
	it("shows the existing agreement before a new proposal and keeps both versions distinct", async () => {
		const html = await render({
			agreements: [
				{ ...row, id: "new-proposal", version: 3 },
				{
					...row,
					id: "active-agreement",
					version: 1,
					status: "accepted",
					termsJson: { ...terms, commissionPercent: 8 },
				},
				{ ...row, id: "future-agreement", version: 2, status: "accepted" },
			],
			resolvedAgreementId: "active-agreement",
			collectionModel: "property_collect",
			agreementStatus: "active",
		})
		expect(html.indexOf("data-accepted-agreement")).toBeLessThan(
			html.indexOf("Propuesta comercial")
		)
		expect(html).toContain("8%")
		expect(html).toContain("12%")
		expect(html).toContain('name="agreementId" value="new-proposal"')
		expect(html).toContain("Versión 1")
		expect(html).toContain("Versión 3")
	})
	it("uses a collapsed scope with escaped names and no per-experience commercial diagnostics", async () => {
		const html = await render({
			experiences: [
				{ id: "tour-a", name: "Tour <test>" },
				{ id: "tour-b", name: "Otro tour" },
			],
		})
		expect(html).toContain("2 experiencias")
		expect(html).toContain("Tour &lt;test&gt;")
		expect(html).toContain('href="/product/tour-a"')
		expect(html).not.toMatch(/<details[^>]*data-agreement-scope[^>]*open/)
		expect(html).not.toContain("Condiciones por definir")
	})
	it.each(["not_started", "expired", "review_required"])(
		"does not label %s as an active agreement",
		async (state) => {
			const html = await render({
				agreements: [{ ...row, status: "accepted" }],
				collectionModel: "property_collect",
				agreementStatus: state,
			})
			expect(html).not.toContain("Acuerdo vigente")
			expect(html).not.toContain("Aceptar acuerdo")
		}
	)
	it("does not expose agreement mutations to a read-only member", async () => {
		const html = await render({
			agreements: [row],
			collectionModel: "property_collect",
			canEdit: false,
		})
		expect(html).not.toContain("data-agreement-form")
	})
	it("keeps an expired accepted agreement distinct from a pending renewal", async () => {
		const html = await render({
			agreements: [
				{ ...row, id: "accepted", status: "accepted" },
				{ ...row, id: "pending", version: 2 },
			],
			collectionModel: "property_collect",
			agreementStatus: "acceptance_required",
			acceptedStatus: "expired",
		})
		expect(html).toContain("Acuerdo vencido")
		expect(html).toContain("Propuesta disponible")
		expect(html).not.toContain("Acuerdo vigente")
	})
	it("does not show an empty history for the accepted agreement and its renewal", async () => {
		const html = await render({
			agreements: [
				{ ...row, id: "accepted", status: "accepted" },
				{ ...row, id: "pending", version: 2 },
			],
			collectionModel: "property_collect",
			agreementStatus: "active",
		})
		expect(html).not.toContain("Versiones anteriores")
	})
	it("keeps renewal secondary when an agreement is already active", async () => {
		const html = await render({
			agreements: [{ ...row, status: "accepted" }],
			collectionModel: "property_collect",
			agreementStatus: "active",
		})
		expect(html).toContain("Acuerdo vigente")
		expect(html).toContain("Solicitar nuevas condiciones")
		expect(html).not.toContain("Aceptar acuerdo")
	})
	it("does not create another request while Fastt is preparing one", async () => {
		const html = await render({
			agreements: [{ ...row, status: "requested", termsJson: null }],
			collectionModel: "property_collect",
			agreementStatus: "proposal_requested",
		})
		expect(html).toContain("Pendiente de Fastt")
		expect(html).not.toContain('name="action" value="request"')
		expect(html).not.toContain("Aceptar acuerdo")
	})
	it("only offers acceptance to the reviewed signer and includes the exact version hash", async () => {
		const html = await render({ agreements: [row], collectionModel: "property_collect" })
		expect(html).toContain("Aceptar acuerdo")
		expect(html).toContain('name="termsHash" value="hash-a"')
		expect(html).not.toMatch(/name="consent"[^>]*checked/)
		const manager = await render({
			agreements: [row],
			collectionModel: "property_collect",
			userId: "manager",
		})
		expect(manager).not.toContain("Aceptar acuerdo")
		expect(manager).toContain("Solicitar una corrección")
	})
})
