import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { routes } from "@/lib/routes"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("V2 optionals subroute — verification = mínimos + wait", () => {
	it("exposes verification/documents route", () => {
		expect(routes.providerSettingsVerificationDocuments()).toBe(
			"/provider/settings/verification/documents"
		)
	})

	it("keeps verification page free of optional upload form", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		expect(page).toContain("data-verification-optionals-entry")
		expect(page).toContain("Documentos adicionales si te los pedimos")
		expect(page).toContain("data-verification-optionals-collapsed")
		expect(page).toContain("providerSettingsVerificationDocuments")
		expect(page).toContain("ProviderVerificationView")
		expect(page).toContain("ProviderKycSlotsCard")
		expect(page).not.toContain("data-optional-upload-form")
		expect(page).toContain("optionalTypeValues")
	})

	it("redirect after KYC submit keeps type focus on the slot", () => {
		const api = read("src/pages/api/provider/settings/documents.ts")
		expect(api).toContain('target.searchParams.set("type", type)')
		expect(api).toContain("kyc-slot-${type}")
		expect(api).toContain("redirectAfterFormError")
		expect(api).toContain("sec-fetch-dest")
	})

	it("KYC form opts out of ClientRouter so POST follows 303 to verification", () => {
		const form = read("src/components/provider/ProviderKycUploadForm.astro")
		const panel = read("src/components/provider/ProviderVerificationOptionals.astro")
		expect(form).toContain("data-astro-reload")
		expect(form).toContain('action="/api/provider/settings/documents"')
		expect(form).toContain('method="post"')
		expect(panel).toContain("data-astro-reload")
	})

	it("hosts optionals list + upload on documents subroute", () => {
		const page = read("src/pages/provider/settings/verification/documents.astro")
		const panel = read("src/components/provider/ProviderVerificationOptionals.astro")
		const api = read("src/pages/api/provider/settings/documents.ts")

		expect(page).toContain("ProviderVerificationOptionals")
		expect(page).toContain("Volver a verificación")
		expect(page).toContain("Documentos adicionales")
		expect(page).toContain(
			"Propiedad, licencias y domicilio. No desbloquean los documentos mínimos de Verificación."
		)

		expect(panel).toContain("data-verification-optionals")
		expect(panel).toContain("data-verification-optionals-page")
		expect(panel).toContain("data-optional-upload-form")
		expect(panel).toContain("data-optional-documents-list")
		expect(panel).toContain("ProviderReviewWaitNotice")
		expect(panel).not.toContain("Respaldo adicional")
		expect(panel).not.toContain("<h2")
		expect(panel.indexOf("{pendingCount} enviado")).toBeGreaterThan(
			panel.indexOf("Subir documento opcional")
		)

		expect(api).toContain("redirectAfterSubmit")
		expect(api).toContain("providerSettingsVerificationDocuments")
		expect(api).toContain("requiredKycDocumentTypes")
	})
})
