import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { readVerificationSurface } from "./read-verification-surface"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("Settings IA: Verificación outside settings tabs", () => {
	it("keeps settings subnav to account surfaces only", () => {
		const subnav = read("src/components/provider/ProviderSettingsSubnav.astro")
		expect(subnav).toContain('label: "Resumen"')
		expect(subnav).toContain('label: "Perfil"')
		expect(subnav).toContain('label: "Equipo"')
		expect(subnav).not.toContain('label: "Fiscalidad"')
		expect(subnav).not.toContain('label: "Integraciones"')
		expect(subnav).not.toContain('label: "Verificación"')
		expect(subnav).not.toContain('label: "Pagos"')
		expect(subnav).toContain("impuestos al huésped tienen su propio espacio de trabajo")
	})

	it("hides settings tabs on verification wizard + optionals pages", () => {
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const verification = readVerificationSurface("src/pages/provider/settings/verification.astro")
		const optionals = read("src/pages/provider/settings/verification/documents.astro")
		const fiscalVerification = readVerificationSurface(
			"src/pages/provider/settings/verification/fiscal.astro"
		)
		const paymentsVerification = readVerificationSurface(
			"src/pages/provider/settings/verification/payments.astro"
		)
		const workspace = read("src/lib/provider-verification-workspace.ts")

		expect(layout).toContain("showSettingsTabs")
		expect(layout).toContain("showSettingsTabs ? <ProviderSettingsSubnav")
		expect(layout).toContain("data-verification-wizard-progress")
		expect(layout).toContain("formatVerificationProgressTotalLine")
		expect(layout).toContain("formatVerificationProgressBreakdownLine")
		expect(layout).not.toContain("ProviderVerificationProgressSummary")
		expect(layout).toContain("aria-valuenow={rawPercent}")
		expect(layout).not.toContain("stepPositionPercent")
		expect(layout).not.toContain("Math.max(rawPercent")
		expect(layout).toContain("verificationPageGuidanceByTab")
		expect(layout).toContain("bg-slate-800")
		expect(layout).toContain('class="mb-5 space-y-2"')
		expect(verification).toContain("showSettingsTabs={false}")
		expect(verification).toContain("readyCount=")
		expect(verification).toContain("totalCount={showWizardProgress ? totalCount : null}")
		expect(verification).not.toContain("nextActionId={showWizardProgress ? nextActionId : null}")
		expect(optionals).toContain("showSettingsTabs={false}")
		expect(fiscalVerification).toContain("showSettingsTabs={false}")
		expect(fiscalVerification).toContain("ProviderTrustMapRail")
		expect(fiscalVerification).toContain("activeId={activeSectionId}")
		expect(fiscalVerification).toContain("buildProviderVerificationTrustSnapshot")
		expect(fiscalVerification).not.toContain("/api/provider/settings/summary")
		expect(fiscalVerification).not.toContain("getProviderFullAggregate")
		expect(paymentsVerification).toContain("showSettingsTabs={false}")
		expect(paymentsVerification).toContain("ProviderTrustMapRail")
		expect(paymentsVerification).toContain("activeId={activeSectionId}")
		expect(paymentsVerification).toContain("buildProviderVerificationTrustSnapshot")
		expect(paymentsVerification).not.toContain("/api/provider/settings/summary")
		expect(paymentsVerification).not.toContain("getProviderFullAggregate")
		expect(workspace).toContain("activeSectionId: VerificationTrustPanelId")
		expect(workspace).toContain("nextActionId: TrustLinkId | null")
		expect(workspace).not.toContain("wizardStepNumber")
	})

	it("shows animated progress label and tab guidance in the header", () => {
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const lib = read("src/lib/provider-trust-map.ts")
		const verification = readVerificationSurface("src/pages/provider/settings/verification.astro")

		expect(layout).toContain("verification-wizard-progress-label--alternate")
		expect(layout).toContain("data-verification-wizard-progress-label")
		expect(layout).not.toContain("Resumen de verificación")

		expect(lib).toContain("buildVerificationPageGuidance")
		expect(lib).toContain("formatVerificationProgressBreakdownLine")
		expect(verification).toContain("buildVerificationPageGuidanceByTab")
		expect(verification).toContain("verificationPageGuidanceByTab=")
		expect(verification).toContain("description={pageGuidance}")

		const panels = read("src/pages/provider/settings/_client/verification-trust-panels.js")
		const workspace = read("src/components/provider/ProviderVerificationWorkspace.astro")
		expect(panels).toContain("preserveVerificationScrollPosition")
		expect(workspace).toContain("data-verification-trust-panels-stage")
		expect(panels).toContain("data-verification-page-guidance")
	})

	it("stacks verification sections with explicit gap (not display:contents)", () => {
		const page = readVerificationSurface("src/pages/provider/settings/verification.astro")
		expect(page).toContain("data-verification-page")
		expect(page).toContain('class="space-y-6 md:space-y-8"')
		expect(page).toMatch(/class="space-y-6 md:space-y-8"\s+data-verification-workspace/)
		expect(page).not.toMatch(/data-verification-page[\s\S]{0,80}class="contents"/)
		expect(page).not.toMatch(/class="contents"[\s\S]{0,80}data-verification-page/)
	})

	it("sidebar activates only the longest matching href (Verificación vs Configuración)", () => {
		const sidebar = read("src/components/dashboard/DashboardSidebar.astro")
		expect(sidebar).toContain("Longest matching href wins")
		expect(sidebar).toContain("hrefPath(item.href) === hrefPath(activeHref)")
		expect(sidebar).not.toContain("item.href === activeHref || isActive(item.href)")
	})

	it("aligns sidebar Configuración section labels with tabs vocabulary", () => {
		const nav = read("src/lib/backoffice-governance.ts")
		expect(nav).toContain('label: "Configuración"')
		expect(nav).toContain('label: "Verificación"')
		expect(nav).toContain('label: "Fiscalidad"')
		expect(nav).toContain('label: "Integraciones"')
		expect(nav).not.toContain('label: "Perfil del proveedor"')
		expect(nav).not.toContain('label: "Impuestos y cargos"')
	})

	it("wires return-to-verification CTAs off the trust rail; legacy payments redirects", () => {
		const glossary = read("src/lib/provider-trust-map.ts")
		const profile = read("src/pages/provider/settings/profile.astro")
		const fiscal = read("src/pages/provider/settings/tax-fees/identity.astro")
		const verificationFiscal = readVerificationSurface(
			"src/pages/provider/settings/verification/fiscal.astro"
		)
		const verificationPayments = readVerificationSurface(
			"src/pages/provider/settings/verification/payments.astro"
		)
		const documents = read("src/pages/provider/settings/verification/documents.astro")
		const payments = read("src/pages/provider/settings/payments.astro")

		expect(glossary).toContain("returnToVerification")
		expect(glossary).toContain("Volver a Verificación")
		expect(profile).not.toContain("TRUST_GLOSSARY.returnToVerification")
		expect(profile).toContain("data-settings-onboarding-resume")
		expect(documents).toContain("Volver a verificación")
		expect(fiscal).toContain("Astro.redirect(routes.providerSettingsVerificationFiscal())")
		expect(verificationFiscal).not.toContain("TRUST_GLOSSARY.returnToVerification")
		expect(verificationFiscal).not.toContain('slot="actions"')
		expect(verificationPayments).not.toContain('slot="actions"')
		expect(verificationPayments).not.toContain("Volver a verificación")
		expect(payments).toContain("ProviderCommercialContractCard")
		expect(payments).toContain("loadProviderContractSurface")
		expect(payments).not.toContain('Astro.redirect("/provider/settings/verification/payments")')
		expect(payments).not.toContain("ProviderPaymentAccountsCard")
	})
})
