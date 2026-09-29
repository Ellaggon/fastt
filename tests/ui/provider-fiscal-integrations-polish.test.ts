import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { previewFiscalIdentitySubmit } from "@/lib/provider-tax-identity-validation"

import { listProviderConnectorCatalog } from "@/lib/provider-integrations"
import { readVerificationSurface } from "./read-verification-surface"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("Fiscal identity and connector guidance", () => {
	it("exposes docs-lite help for every connector in the catalog", () => {
		const catalog = listProviderConnectorCatalog()
		expect(catalog.length).toBeGreaterThanOrEqual(4)
		for (const item of catalog) {
			expect(item.docsLite.title.length).toBeGreaterThan(8)
			expect(item.docsLite.steps.length).toBeGreaterThan(0)
		}
		expect(catalog.some((item) => String(item.key) === "payment_gateway")).toBe(false)
	})

	it("keeps fiscal identity separate from invoicing and unavailable settlements", () => {
		const identity = readVerificationSurface(
			"src/pages/provider/settings/verification/fiscal.astro"
		)
		const taxCard = read("src/components/provider/ProviderTaxProfileCard.astro")
		const collectionCard = read("src/components/provider/ProviderLodgingCollectionModel.astro")
		const integrations = read(
			"src/pages/provider/settings/integrations/connect/channel-manager.astro"
		)

		expect(identity).not.toContain("Ir a cuentas de liquidación")
		expect(identity).not.toContain("Resumen fiscal</Button>")
		expect(identity).toContain("ProviderTaxProfileCard")
		expect(taxCard).not.toContain('name="invoicingMode"')
		expect(taxCard).not.toContain("retener o retrasar liquidaciones")
		expect(taxCard).toContain("data-fiscal-scope-note")
		expect(taxCard).toContain("Estos datos identifican al contribuyente; no configuran cobros.")
		expect(taxCard).not.toContain("acuerdo comercial")
		expect(taxCard).not.toContain("comisión")
		expect(collectionCard).toContain('data-commercial-line-collection-model="lodging"')
		expect(collectionCard).not.toContain("Cobros de tus tours")
		expect(collectionCard).toContain('value="platform_collect" selected disabled')
		expect(taxCard).toContain("data-fiscal-action-lead")
		expect(taxCard).toContain("identificador tributario")
		expect(taxCard).toContain("data-fiscal-form-actions")
		expect(taxCard).toContain("fastt-form-submit-footer")
		expect(taxCard).toContain("Enviar identidad fiscal")
		expect(taxCard).toContain("data-fiscal-submitted-summary")
		expect(taxCard).toContain("data-fiscal-identity-form")
		expect(taxCard).toContain("data-fiscal-registration-error")
		expect(taxCard).toContain("text-sm text-red-600")
		expect(taxCard).toContain("previewFiscalIdentitySubmit")
		expect(taxCard).toContain("Corregir y volver a enviar")

		expect(taxCard).toContain("No se guardó la identidad fiscal")
		expect(taxCard).toContain("data-fiscal-registration-error-body")
		expect(taxCard).toContain("fiscalIdentityErrorMessage")

		const workspace = read("src/components/provider/ProviderVerificationWorkspace.astro")
		expect(workspace).toContain('selectedLine === "lodging" && activeSectionId === "payments"')
		expect(workspace).toContain("Revisar cobro histórico de tours")
		expect(workspace).not.toContain("Acuerdo pendiente")
		const validation = read("src/lib/provider-tax-identity-validation.ts")
		expect(workspace).toContain("saveError={fiscalError}")
		expect(workspace).not.toContain('title="No se guardó la identidad fiscal"')
		expect(validation).toContain("incomplete_tax_identity")
		expect(validation).toContain("No se guardó el registro")
		expect(
			previewFiscalIdentitySubmit({
				taxResidenceCountry: "",
				businessRegistrationNumber: "",
				taxRegime: "",
			})
		).toEqual({
			ok: false,
			code: "incomplete_tax_identity",
			message: "Completa el país, el NIT o el régimen antes de enviar.",
		})
		expect(
			previewFiscalIdentitySubmit({
				taxResidenceCountry: "BO",
				businessRegistrationNumber: "NIT-123",
				taxRegime: "general",
			})
		).toMatchObject({
			ok: false,
			code: "invalid_bo_nit",
			message: "El NIT boliviano debe tener entre 7 y 12 dígitos.",
		})
		expect(
			previewFiscalIdentitySubmit({
				taxResidenceCountry: "BO",
				businessRegistrationNumber: "1020304050",
				taxRegime: "general",
			})
		).toEqual({ ok: true })

		const taxApi = read("src/pages/api/provider/settings/tax-configuration.ts")
		expect(taxApi).toContain('form.has("invoicingMode")')
		expect(taxApi).toContain("application/x-www-form-urlencoded")
		expect(taxApi).toContain("redirectAfterFiscalSubmit")
		expect(taxApi).toContain("tax_profile_saved")
		expect(integrations).toContain('data-channel-wizard-step="access"')
		expect(integrations).toContain("Selecciona el sistema")
		expect(integrations).toContain("Autorizar acceso")
	})
})
