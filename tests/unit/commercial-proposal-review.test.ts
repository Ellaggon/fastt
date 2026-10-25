import { describe, expect, it } from "vitest"
import { prepareProposalReview } from "@/lib/commercial-policy/proposal-review"

const values = {
	commissionPercent: "0",
	commissionBase: "Importe cobrado por el servicio sin impuestos separados.",
	currency: "USD",
	effectiveFrom: "2026-10-01",
	effectiveTo: "2027-10-01",
	paymentTiming: "El proveedor cobra directamente antes de la experiencia.",
	cancellationTerms: "Las devoluciones respetan el contrato aceptado por el viajero.",
	settlementTerms: "Conciliación mensual según los servicios efectivamente cobrados.",
	fiscalResponsibilities: "Cada parte documenta su propia actividad y sus impuestos.",
	fullTerms:
		"Propuesta ficticia de prueba sin efecto contractual, diseñada exclusivamente para verificar la revisión local previa a la autorización de un acuerdo comercial.",
	documentReference: "fixture-contract",
	signerUserId: "reviewed-signer",
	representationReference: "reviewed-mandate",
}
function form(overrides: Partial<typeof values> = {}) {
	const data = new FormData()
	for (const [key, value] of Object.entries({ ...values, ...overrides })) data.set(key, value)
	return data
}
describe("commercial proposal review", () => {
	it("prepares a local review without persisting and accepts explicit zero commission", () => {
		const result = prepareProposalReview(form())
		expect(result.ok).toBe(true)
		if (result.ok) expect(result.terms.commissionPercent).toBe(0)
	})
	it.each([
		{ commissionPercent: "" },
		{ effectiveTo: "2020-01-01" },
		{ signerUserId: "" },
		{ representationReference: "" },
	])("rejects incomplete or contradictory review data %j", (overrides) => {
		expect(prepareProposalReview(form(overrides)).ok).toBe(false)
	})
})
