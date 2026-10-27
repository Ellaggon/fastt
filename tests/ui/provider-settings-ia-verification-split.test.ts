import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { readVerificationSurface } from "./read-verification-surface"
import { resolveProviderNavigationSelection } from "@/lib/dashboard/providerNavigationSelection"

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
		expect(layout).toContain("showSettingsTabs ? <ProviderSettingsSubnav /> : null")
		expect(layout).toContain("<ProviderSettingsSubnav")
		expect(layout).toContain("data-verification-operational-summary")
		expect(layout).toContain("sm:flex-row sm:items-center sm:justify-between")
		expect(layout).not.toContain("Sin acciones pendientes para ti en esta sección.")
		expect(layout).toContain("!(isVerificationPage && verificationSummary)")
		expect(layout).not.toContain("data-verification-wizard-progress")
		expect(layout).not.toContain("ProviderVerificationProgressSummary")
		expect(layout).not.toContain('role="progressbar"')
		expect(layout).toContain('import ProgressBar from "@/components/ui/ProgressBar.astro"')
		expect(layout).toContain("data-verification-completion-progress")
		expect(layout).toContain("value={verificationProgress.completed}")
		expect(layout).toContain("max={verificationProgress.total}")
		expect(layout).not.toContain("stepPositionPercent")
		expect(layout).not.toContain("Math.max(rawPercent")
		expect(layout).toContain("verificationPageGuidanceByTab")
		expect(verification).toContain("showSettingsTabs={false}")
		expect(verification).toContain("verificationSummary={operationalSummary}")
		expect(verification).not.toContain("nextActionId={showWizardProgress ? nextActionId : null}")
		expect(optionals).toContain("showSettingsTabs={false}")
		expect(fiscalVerification).toContain("showSettingsTabs={false}")
		expect(fiscalVerification).toContain("<ProviderVerificationWorkspace model={model} />")
		expect(fiscalVerification).toContain('data-verification-trust-panel="fiscal"')
		expect(fiscalVerification).toContain("buildProviderVerificationTrustSnapshot")
		expect(fiscalVerification).not.toContain("/api/provider/settings/summary")
		expect(fiscalVerification).not.toContain("getProviderFullAggregate")
		expect(paymentsVerification).toContain("showSettingsTabs={false}")
		expect(paymentsVerification).toContain("<ProviderVerificationWorkspace model={model} />")
		expect(paymentsVerification).toContain('data-verification-trust-panel="payments"')
		expect(paymentsVerification).toContain("buildProviderVerificationTrustSnapshot")
		expect(paymentsVerification).not.toContain("/api/provider/settings/summary")
		expect(paymentsVerification).not.toContain("getProviderFullAggregate")
		expect(workspace).toContain("activeSectionId: VerificationTrustPanelId")
		expect(workspace).toContain("nextActionId: TrustLinkId | null")
		expect(workspace).not.toContain("wizardStepNumber")
	})

	it("shows a stable operational summary and preserves local tab guidance", () => {
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const lib = read("src/lib/provider-trust-map.ts")
		const verification = readVerificationSurface("src/pages/provider/settings/verification.astro")

		expect(layout).not.toContain("verification-wizard-progress-label--alternate")
		expect(layout).toContain("data-verification-operational-summary")
		expect(layout).not.toContain("Resumen de verificación")

		expect(lib).toContain("buildVerificationPageGuidance")
		expect(lib).not.toContain("formatVerificationProgressBreakdownLine")
		expect(verification).toContain("buildVerificationPageGuidanceByTab")
		expect(verification).toContain("verificationPageGuidanceByTab=")
		expect(verification).toContain("pageGuidanceByTab[activeSectionId")
		expect(verification).toContain('model.navigation?.line === "tour"')
		expect(read("src/components/provider/ProviderVerificationBusinessNav.astro")).not.toContain(
			"Se aplica al negocio y se comparte entre sus experiencias."
		)

		const panels = read("src/pages/provider/settings/_client/verification-trust-panels.js")
		const workspace = read("src/components/provider/ProviderVerificationWorkspace.astro")
		expect(panels).toContain("preserveVerificationScrollPosition")
		expect(panels).toContain("[data-verification-tab-link]")
		expect(panels).toContain("syncVerificationTabNav")
		expect(workspace).toContain("data-verification-trust-panels-stage")
		expect(panels).toContain("data-verification-page-guidance")
	})

	it("keeps the accessible tour identity panel aligned with its tab state", () => {
		const workspace = read("src/components/provider/ProviderVerificationWorkspace.astro")
		expect(workspace).toContain(
			'selectedLine === "tour" ? tourPlaybook.find((tab) => tab.id === id)'
		)
		expect(workspace).toContain("tourTab.label}. Estado: ${tourTab.stateLabel}")
		const business = read("src/components/provider/ProviderTourBusinessVerification.astro")
		expect(business).toContain("data-verification-account-review")
		expect(business).toContain("Los documentos conservan su propio resultado")
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
		expect(
			resolveProviderNavigationSelection({
				path: "/provider/settings/verification",
				vertical: null,
				items: [
					{ id: "settings", href: "/provider/settings" },
					{ id: "route:/provider/settings/verification", href: "/provider/settings/verification" },
				],
			})
		).toBe("route:/provider/settings/verification")
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
		expect(profile).not.toContain("data-settings-onboarding-resume")
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
