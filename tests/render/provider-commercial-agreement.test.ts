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
		expect(html).toContain("Confirmado")
		expect(html).not.toContain("Confirmar cobro directo")
		expect(html).not.toContain(">Confirmación<")
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
