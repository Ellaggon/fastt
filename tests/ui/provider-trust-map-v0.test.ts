import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

import { buildRequiredKycSlots } from "@/lib/provider-documents"
import {
	assertNoLegacyPendingLabel,
	buildProviderTrustMap,
	labelAccountVerificationStatus,
	labelDocumentKycState,
	labelMatrixCheckState,
	TRUST_GLOSSARY,
} from "@/lib/provider-trust-map"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("V0 trust map IA + glossary (cuenta vs docs)", () => {
	it("defines 4 eslabones Identidad → Negocio → Fiscal → Pagos", () => {
		const links = buildProviderTrustMap({
			accountStatus: "pending",
			documentsComplete: false,
			hasMissingDocs: true,
			fiscalStatus: "not_configured",
			verifiedPaymentAccounts: 0,
		})
		expect(links.map((link) => link.id)).toEqual([
			"identity",
			"business",
			"fiscal",
			"payments",
		])
		expect(links.map((link) => link.label)).toEqual([
			TRUST_GLOSSARY.links.identity.label,
			TRUST_GLOSSARY.links.business.label,
			TRUST_GLOSSARY.links.fiscal.label,
			TRUST_GLOSSARY.links.payments.label,
		])
		expect(links.some((link) => link.isFocus)).toBe(true)
		expect(links.find((link) => link.id === "identity")?.href).toContain(
			"#verification-status-panel"
		)
		expect(links.find((link) => link.id === "business")?.href).toContain("#kyc-slots")
		expect(links.find((link) => link.id === "fiscal")?.href).toContain(
			"/verification/fiscal"
		)
		expect(links.find((link) => link.id === "payments")?.href).toContain("/payments")
	})

	it("uses unique ES labels: cuenta En revisión/Lista · docs Falta/Enviado/Verificado", () => {
		expect(labelAccountVerificationStatus("pending").label).toBe("En revisión")
		expect(labelAccountVerificationStatus("approved").label).toBe("Lista")
		expect(labelAccountVerificationStatus("rejected").label).toBe("Requiere cambios")

		expect(labelDocumentKycState("missing")).toBe("Falta")
		expect(labelDocumentKycState("pending")).toBe("Enviado")
		expect(labelDocumentKycState("verified")).toBe("Verificado")
		expect(labelDocumentKycState("rejected")).toBe("Requiere cambios")

		expect(labelMatrixCheckState({ complete: false })).toBe("Falta")
		expect(labelMatrixCheckState({ complete: false, pending: true })).toBe("Enviado")
		expect(labelMatrixCheckState({ complete: true })).toBe("Listo")

		for (const label of [
			labelAccountVerificationStatus("pending").label,
			labelAccountVerificationStatus("approved").label,
			labelDocumentKycState("missing"),
			labelDocumentKycState("pending"),
			labelDocumentKycState("verified"),
		]) {
			expect(assertNoLegacyPendingLabel(label)).toBe(true)
		}
	})

	it("aligns KYC slot labels with glossary (no Pendiente)", () => {
		const slots = buildRequiredKycSlots({ documents: [] })
		expect(slots.every((slot) => slot.stateLabel === "Falta")).toBe(true)
		expect(slots.every((slot) => assertNoLegacyPendingLabel(slot.stateLabel))).toBe(true)
	})

	it("wires trust rail + glossary into verification surfaces", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		const view = read("src/components/provider/ProviderVerificationView.astro")
		const card = read("src/components/provider/ProviderKycSlotsCard.astro")
		const rail = read("src/components/provider/ProviderTrustMapRail.astro")
		const railClient = read("src/pages/provider/settings/_client/provider-trust-rail.js")
		const lib = read("src/lib/provider-trust-map.ts")

		expect(lib).toContain("TRUST_GLOSSARY")
		expect(lib).toContain("buildProviderTrustMap")
		expect(lib).toContain('legacyPending: "Pendiente"')

		expect(page).toContain("ProviderTrustMapRail")
		expect(page).toContain("buildProviderTrustMap")
		expect(page).toContain("TRUST_GLOSSARY.page.description")

		expect(rail).toContain("data-trust-map-rail")
		expect(rail).toContain("data-trust-link")
		expect(rail).toContain('data-astro-prefetch="viewport"')
		expect(rail).toContain("resolveInitialActiveId")
		expect(rail).toContain("currentActiveId")
		expect(rail).toContain("const active = link.id === currentActiveId")
		expect(rail).toContain("data-trust-link-active")
		expect(rail).toContain("TabsInsidePanel")
		expect(rail).toContain("fastt-tabs-inside-panel__item")
		expect(rail).toContain("fastt-tabs-inside-panel__label")
		expect(rail).toContain("fastt-tabs-inside-panel__status")
		expect(rail).toContain("statusBadgeByState")
		expect(rail).toContain("darkWarning")
		expect(rail).toContain("darkError")
		expect(rail).toContain("darkSuccess")
		expect(rail).toContain("ShieldCheck")
		expect(rail).toContain("Briefcase")
		expect(rail).toContain("ReceiptText")
		expect(rail).toContain("CircleDollarSign")
		expect(rail).toContain("link.stateLabel")
		expect(rail).toContain("data-trust-link-status")
		expect(rail).toContain('data-active={active ? "true" : "false"}')
		expect(rail).toContain("provider-trust-rail.js")
		expect(railClient).toContain("resolveTrustRailActiveId")
		expect(railClient).toContain("/provider/settings/verification/fiscal")
		expect(railClient).toContain('window.location.hash === "#kyc-slots"')
		expect(railClient).toContain('window.location.hash.startsWith("#kyc-slot-")')
		expect(railClient).toContain("provider-verification-trust-sync")
		expect(railClient).toContain("astro:page-load")
		expect(rail).not.toContain("TabsOutsidePanel")
		expect(rail).not.toContain("statusClassForLink")
		expect(rail).not.toContain("En foco")
		expect(rail).toContain('data-trust-map-quiet="true"')
		expect(rail).not.toContain("data-trust-map-hint")
		expect(rail).not.toContain("railHint")
		expect(TRUST_GLOSSARY.page.railTitle).toBe("Cuenta")

		expect(view).toContain("labelAccountVerificationStatus")
		expect(view).toContain("data-trust-account-vs-docs")
		expect(view).toContain('data-verification-matrix="removed"')
		expect(view).not.toContain('"Pendiente"')
		expect(view).toContain("enviados")

		expect(card).toContain("TRUST_GLOSSARY.page.deferOtherSlot")
		expect(card).toContain('id="kyc-slots"')
		expect(card).not.toContain("Pendiente — termina primero")
	})
})
