import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import {
	buildProviderTrustMap,
	isProviderTrustMapComplete,
	isVerificationListaReady,
	PROFILE_LEGAL_NAME_HREF,
	resolveVerificationNextStep,
	TRUST_GLOSSARY,
	VERIFICATION_PUBLISH_HREF,
} from "@/lib/provider-trust-map"
import { routes } from "@/lib/routes"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

/** Simulates the four map inputs after each journey milestone. */
function mapAfter(step: {
	legalNameComplete?: boolean
	accountApproved?: boolean
	documentsComplete?: boolean
	fiscalVerified?: boolean
	paymentsVerified?: boolean
}) {
	return buildProviderTrustMap({
		legalNameComplete: step.legalNameComplete !== false,
		accountStatus: step.accountApproved ? "approved" : "pending",
		documentsComplete: Boolean(step.documentsComplete),
		hasMissingDocs: !step.documentsComplete,
		hasRejectedDocs: false,
		hasSubmittedDocs: false,
		fiscalStatus: step.fiscalVerified ? "verified" : "not_configured",
		verifiedPaymentAccounts: step.paymentsVerified ? 1 : 0,
		pendingPaymentAccounts: 0,
	})
}

describe("P2 Lista end-to-end after completing trust map", () => {
	it("blocks Lista while Perfil legal name is missing even if account is approved", () => {
		const links = mapAfter({
			legalNameComplete: false,
			accountApproved: true,
			documentsComplete: true,
			fiscalVerified: true,
			paymentsVerified: true,
		})
		expect(isProviderTrustMapComplete(links)).toBe(false)
		expect(links.find((link) => link.id === "identity")?.uiState).toBe("action_needed")
		expect(links.find((link) => link.id === "identity")?.href).toBe(PROFILE_LEGAL_NAME_HREF)
		expect(
			isVerificationListaReady({ trustLinks: links, legalNameComplete: false })
		).toBe(false)

		const next = resolveVerificationNextStep({
			trustLinks: links,
			legalNameComplete: false,
			canManageDocuments: true,
		})
		expect(next.tone).not.toBe("success")
		expect(next.ctaHref).toBe(PROFILE_LEGAL_NAME_HREF)
	})

	it("walks Perfil → Negocio → Fiscal → Pagos → Lista without dead ends", () => {
		const afterPerfil = mapAfter({ legalNameComplete: true })
		expect(isProviderTrustMapComplete(afterPerfil)).toBe(false)
		// Focus prefers Negocio (docs missing) over Identidad en revisión.
		expect(afterPerfil.find((link) => link.isFocus)?.id).toBe("business")
		expect(
			resolveVerificationNextStep({
				trustLinks: afterPerfil,
				legalNameComplete: true,
				canManageDocuments: true,
				focusSlot: {
					type: "government_id",
					label: "Documento de identidad",
					state: "missing",
				},
			}).ctaKind
		).toBe("upload")

		const afterAccount = mapAfter({ legalNameComplete: true, accountApproved: true })
		expect(afterAccount.find((link) => link.id === "identity")?.uiState).toBe("ready")
		expect(afterAccount.find((link) => link.isFocus)?.id).toBe("business")

		const afterDocs = mapAfter({
			legalNameComplete: true,
			accountApproved: true,
			documentsComplete: true,
		})
		expect(afterDocs.find((link) => link.id === "business")?.uiState).toBe("ready")
		expect(afterDocs.find((link) => link.isFocus)?.id).toBe("fiscal")
		expect(
			resolveVerificationNextStep({
				trustLinks: afterDocs,
				legalNameComplete: true,
			}).ctaHref
		).toBe(routes.providerSettingsVerificationFiscal())

		const afterFiscal = mapAfter({
			legalNameComplete: true,
			accountApproved: true,
			documentsComplete: true,
			fiscalVerified: true,
		})
		expect(afterFiscal.find((link) => link.isFocus)?.id).toBe("payments")
		expect(
			resolveVerificationNextStep({
				trustLinks: afterFiscal,
				legalNameComplete: true,
			}).ctaHref
		).toBe(routes.providerSettingsVerificationPayments())

		const lista = mapAfter({
			legalNameComplete: true,
			accountApproved: true,
			documentsComplete: true,
			fiscalVerified: true,
			paymentsVerified: true,
		})
		expect(isProviderTrustMapComplete(lista)).toBe(true)
		expect(isVerificationListaReady({ trustLinks: lista, legalNameComplete: true })).toBe(true)
		expect(lista.every((link) => !link.isFocus)).toBe(true)

		const next = resolveVerificationNextStep({
			trustLinks: lista,
			legalNameComplete: true,
			canManageDocuments: true,
		})
		expect(next.tone).toBe("success")
		expect(next.eyebrow).toBe(TRUST_GLOSSARY.page.readyEyebrow)
		expect(next.title).toBe(TRUST_GLOSSARY.page.readyTitle)
		expect(next.consequenceLine).toBeNull()
		expect(next.ctaHref).toBe(VERIFICATION_PUBLISH_HREF)
		expect(next.ctaLabel).toBe(TRUST_GLOSSARY.page.readyPrimaryCta)
		expect(next.secondaryCtaHref).toBe(routes.providerSettingsVerificationPayments())
		expect(next.ctaKind).toBe("navigate")
		expect(next.anchorsKyc).toBe(false)
	})

	it("wires Lista page: no KYC upload journey, lista markers, publish CTAs", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const next = read("src/components/provider/ProviderVerificationNextStep.astro")
		const rail = read("src/components/provider/ProviderTrustMapRail.astro")

		expect(page).toContain("isVerificationListaReady")
		expect(page).toContain("listaReady")
		expect(page).toContain("legalNameComplete")
		expect(page).toContain('data-verification-lista={listaReady ? "true" : "false"}')
		expect(page).toContain("data-verification-lista-docs")
		expect(page).toContain("Documentos mínimos listos")
		expect(page).toContain("listaReady ? (")
		expect(page).toContain("trustMapComplete={listaReady}")
		expect(page).not.toContain("elevated={!trustMapComplete}")

		expect(next).toContain('data-verification-lista={isSuccess ? "true" : undefined}')
		expect(next).not.toContain("data-next-step-secondary-cta")
		expect(next).not.toContain("!isSuccess && crossLinks.length")

		expect(rail).toContain("data-trust-map-complete")
		expect(VERIFICATION_PUBLISH_HREF).toContain("/product/create")
	})
})
