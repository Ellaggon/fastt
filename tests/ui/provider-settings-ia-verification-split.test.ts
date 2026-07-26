import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const root = new URL("../../", import.meta.url)

function read(relativePath: string) {
	return readFileSync(new URL(relativePath, root), "utf8")
}

describe("Settings IA: Verificación outside settings tabs", () => {
	it("keeps settings subnav to data surfaces only (no Verificación tab)", () => {
		const subnav = read("src/components/provider/ProviderSettingsSubnav.astro")
		expect(subnav).toContain('label: "Resumen"')
		expect(subnav).toContain('label: "Perfil"')
		expect(subnav).toContain('label: "Fiscalidad"')
		expect(subnav).toContain('label: "Integraciones"')
		expect(subnav).toContain('label: "Equipo"')
		expect(subnav).not.toContain('label: "Verificación"')
		expect(subnav).not.toContain('label: "Pagos"')
		expect(subnav).toContain("Verificación lives outside this tab bar")
	})

	it("hides settings tabs on verification wizard + optionals pages", () => {
		const layout = read("src/layouts/ProviderSettingsLayout.astro")
		const verification = read("src/pages/provider/settings/verification.astro")
		const optionals = read("src/pages/provider/settings/verification/documents.astro")
		const fiscalVerification = read("src/pages/provider/settings/verification/fiscal.astro")
		const paymentsVerification = read("src/pages/provider/settings/verification/payments.astro")

		expect(layout).toContain("showSettingsTabs")
		expect(layout).toContain("showSettingsTabs ? <ProviderSettingsSubnav")
		expect(layout).toContain("data-verification-wizard-progress")
		expect(layout).toContain("bg-slate-800")
		expect(layout).toContain('class="mb-5 space-y-2"')
		expect(verification).toContain("showSettingsTabs={false}")
		expect(verification).toContain("progressStep=")
		expect(verification).toContain("progressTotal={showWizardProgress ? trustLinks.length : null}")
		expect(optionals).toContain("showSettingsTabs={false}")
		expect(fiscalVerification).toContain("showSettingsTabs={false}")
		expect(fiscalVerification).toContain("ProviderTrustMapRail")
		expect(fiscalVerification).toContain('activeId="fiscal"')
		expect(fiscalVerification).toContain("buildProviderVerificationTrustSnapshot")
		expect(fiscalVerification).not.toContain("/api/provider/settings/summary")
		expect(fiscalVerification).not.toContain("getProviderFullAggregate")
		expect(paymentsVerification).toContain("showSettingsTabs={false}")
		expect(paymentsVerification).toContain("ProviderTrustMapRail")
		expect(paymentsVerification).toContain('activeId="payments"')
		expect(paymentsVerification).toContain("buildProviderVerificationTrustSnapshot")
		expect(paymentsVerification).not.toContain("/api/provider/settings/summary")
		expect(paymentsVerification).not.toContain("getProviderFullAggregate")
	})

	it("stacks verification sections with explicit gap (not display:contents)", () => {
		const page = read("src/pages/provider/settings/verification.astro")
		expect(page).toContain('data-verification-page')
		expect(page).toContain('class="space-y-4"')
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

	it("wires return-to-verification CTAs on profile and fiscal; legacy payments redirects", () => {
		const glossary = read("src/lib/provider-trust-map.ts")
		const profile = read("src/pages/provider/settings/profile.astro")
		const fiscal = read("src/pages/provider/settings/tax-fees/identity.astro")
		const verificationFiscal = read("src/pages/provider/settings/verification/fiscal.astro")
		const payments = read("src/pages/provider/settings/payments.astro")

		expect(glossary).toContain("returnToVerification")
		expect(glossary).toContain("Volver a Verificación")
		expect(profile).toContain("TRUST_GLOSSARY.returnToVerification")
		expect(fiscal).toContain("Astro.redirect(routes.providerSettingsVerificationFiscal())")
		expect(verificationFiscal).toContain("TRUST_GLOSSARY.returnToVerification")
		expect(payments).toContain('Astro.redirect("/provider/settings/verification/payments")')
		expect(payments).not.toContain("ProviderPaymentAccountsCard")
	})
})
