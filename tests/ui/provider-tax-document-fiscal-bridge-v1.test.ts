import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	buildRequiredKycSlots,
	buildTaxDocumentFiscalBridge,
	evaluateRequiredKycDocumentsComplete,
	FISCAL_NIT_HREF,
	isTaxDocumentSatisfiedByFiscal,
	maskTaxpayerId,
	resolveKycUploadFocusType,
} from "@/lib/provider-documents"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("V1.1 tax_document ↔ Fiscalidad bridge", () => {
	it("masks NIT and deep-links to Verificación fiscal field", () => {
		expect(maskTaxpayerId("NIT-12345678")).toBe("••••5678")
		expect(FISCAL_NIT_HREF).toContain("/verification/fiscal")
		expect(FISCAL_NIT_HREF).toContain("#businessRegistrationNumber")
	})

	it("builds enter_nit bridge when NIT is missing (no blind upload)", () => {
		const bridge = buildTaxDocumentFiscalBridge({
			businessRegistrationNumber: null,
			status: "not_configured",
			statusLabel: "No configurado",
		})
		expect(bridge?.mode).toBe("enter_nit")
		expect(bridge?.suppressBlindUpload).toBe(true)
		expect(bridge?.allowOptionalUpload).toBe(false)
		expect(bridge?.fiscalHref).toBe(FISCAL_NIT_HREF)
	})

	it("keeps tax_document on Fiscalidad when NIT is missing, even with explicit focus", () => {
		const slots = buildRequiredKycSlots({
			documents: [],
			taxFiscal: {
				businessRegistrationNumber: null,
				status: "not_configured",
				statusLabel: "No configurado",
			},
		})
		const tax = slots.find((slot) => slot.type === "tax_document")
		expect(tax?.state).toBe("missing")
		expect(tax?.fiscalBridge?.mode).toBe("enter_nit")
		expect(tax?.fiscalBridge?.suppressBlindUpload).toBe(true)
		expect(resolveKycUploadFocusType({ slots, focusType: "tax_document" })).toBeNull()
	})

	it("builds linked bridge with bureau status when NIT exists", () => {
		const bridge = buildTaxDocumentFiscalBridge({
			businessRegistrationNumber: "1020304050",
			status: "pending",
			statusLabel: "En revisión",
			tinBureau: {
				matchStatus: "match",
				matchLabel: "Coincide",
				hostNarrative: "El bureau confirmó el match TIN/nombre.",
			},
		})
		expect(bridge?.mode).toBe("linked")
		expect(bridge?.suppressBlindUpload).toBe(true)
		expect(bridge?.nitMasked).toBe("••••4050")
		expect(bridge?.bureauMatchStatus).toBe("match")
		expect(bridge?.bureauNarrative).toContain("bureau")
	})

	it("allows optional constancia when bureau mismatch / requires_attention", () => {
		const bridge = buildTaxDocumentFiscalBridge({
			businessRegistrationNumber: "999900",
			status: "requires_attention",
			statusLabel: "Requiere atención",
			tinBureau: { matchStatus: "mismatch", matchLabel: "No coincide" },
		})
		expect(bridge?.mode).toBe("needs_constancia")
		expect(bridge?.allowOptionalUpload).toBe(true)
		expect(bridge?.suppressBlindUpload).toBe(false)
	})

	it("does not focus blind tax_document upload when NIT is linked", () => {
		const slots = buildRequiredKycSlots({
			documents: [],
			taxFiscal: {
				businessRegistrationNumber: "ABC-123456",
				status: "pending",
				statusLabel: "En revisión",
				tinBureau: { matchStatus: "format_ok", matchLabel: "Formato OK" },
			},
		})
		const tax = slots.find((slot) => slot.type === "tax_document")
		expect(tax?.fiscalBridge?.mode).toBe("linked")
		expect(tax?.state).toBe("pending")
		expect(resolveKycUploadFocusType({ slots })).toBe("government_id")
		expect(resolveKycUploadFocusType({ slots, focusType: "tax_document" })).toBeNull()
	})

	it("treats verified fiscal NIT as satisfying tax_document KYC", () => {
		expect(
			isTaxDocumentSatisfiedByFiscal({
				businessRegistrationNumber: "123",
				fiscalStatus: "verified",
			})
		).toBe(true)
		expect(
			isTaxDocumentSatisfiedByFiscal({
				businessRegistrationNumber: "123",
				fiscalStatus: "pending",
			})
		).toBe(false)

		const evalResult = evaluateRequiredKycDocumentsComplete(
			[
				{ type: "government_id", status: "verified" },
				{ type: "business_registration", status: "verified" },
			],
			{ taxDocumentSatisfiedByFiscal: true }
		)
		expect(evalResult.complete).toBe(true)
		expect(evalResult.missingRequiredTypes).toEqual([])
	})

	it("wires bridge UI into verification KYC card + page", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const taxCard = read("src/components/provider/ProviderTaxProfileCard.astro")
		const governance = read("src/lib/provider-governance.ts")

		expect(page).toContain("taxFiscal:")
		expect(page).toContain("isTaxDocumentSatisfiedByFiscal")
		expect(page).toContain("fiscalBridge")

		expect(card).toContain("data-kyc-tax-fiscal-bridge")
		expect(card).toContain("data-bridge-fiscal-cta")
		expect(card).toContain("data-bridge-bureau-status")
		expect(card).toContain("suppressBlindUpload")
		expect(card).toContain("fiscalOnlySlot")
		expect(card).toContain('requestedSlot?.type === "tax_document"')
		expect(card).toContain('requestedSlot.fiscalBridge?.mode === "enter_nit"')
		expect(card).toContain("? [fiscalOnlySlot]")
		expect(card).toContain('data-kyc-slot-focus={isFocused ? "true" : undefined}')

		expect(taxCard).toContain('id="businessRegistrationNumber"')
		expect(governance).toContain("taxDocumentSatisfiedByFiscal")
	})
})
