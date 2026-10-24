import { experimental_AstroContainer as AstroContainer } from "astro/container"
import { describe, expect, it } from "vitest"
import ProviderBankAccountReview from "@/components/admin/ProviderBankAccountReview.astro"
import ProviderPaymentAccountsCard from "@/components/provider/ProviderPaymentAccountsCard.astro"

const account = {
	id: "account-a",
	providerId: "provider-a",
	status: "pending",
	bankName: "Banco Ejemplo",
	accountHolderName: "Empresa Ejemplo",
	accountReference: "••••1234",
	accountIdentifier: "NEVER_RENDER_FULL_ACCOUNT",
	country: "BO",
	currency: "USD",
	method: "bank_transfer",
	verificationMethod: "unverified",
	microDeposit: { status: "none", initiatedAt: null, expiresAt: null, attempts: 0 },
	createdAt: new Date("2026-10-01"),
	reviewedAt: null,
	reviewReason: null,
}
async function admin(accounts: unknown[] = [account], canReview = true) {
	const container = await AstroContainer.create()
	return container.renderToString(ProviderBankAccountReview, {
		props: {
			accounts,
			legalName: "Empresa Ejemplo",
			canReview,
			caseIds: { "account-a": "case-a" },
		},
	})
}
async function provider(accounts: unknown[], canManagePayments = true) {
	const container = await AstroContainer.create()
	return container.renderToString(ProviderPaymentAccountsCard, {
		request: new Request("http://localhost/provider/settings/verification?tab=payments"),
		props: { accounts, canManagePayments },
	})
}
describe("bank account review surfaces", () => {
	it("explains an empty provider account instead of claiming review completion", async () => {
		const html = await admin([])
		expect(html).toContain("aún no ha enviado una cuenta bancaria")
		expect(html).not.toContain("Verificar cuenta")
		expect(html).not.toContain("Sin acciones pendientes")
	})
	it("places decisions with the account, holder and evidence, without exposing secrets", async () => {
		const html = await admin()
		expect(html).toContain("Titular bancario")
		expect(html).toContain("Titular del proveedor")
		expect(html).toContain("/admin/cases/case-a")
		expect(html).toContain("Verificar cuenta")
		expect(html).toContain("Solicitar corrección")
		expect(html).toContain('minlength="10"')
		expect(html).not.toContain("NEVER_RENDER_FULL_ACCOUNT")
		expect(html).not.toContain("Iniciar verificación bancaria")
	})
	it("retains the approved result and removes decision buttons", async () => {
		const html = await admin([
			{
				...account,
				status: "verified",
				verificationMethod: "manual",
				reviewedAt: new Date(),
				reviewReason: "Constancia bancaria corroborada.",
			},
		])
		expect(html).toContain("Verificada")
		expect(html).toContain("Constancia bancaria corroborada.")
		expect(html).not.toContain("Verificar cuenta")
		expect(html).not.toContain("Solicitar corrección")
	})
	it("gates review controls by permission", async () => {
		const html = await admin([account], false)
		expect(html).not.toContain("Verificar cuenta")
		expect(html).toContain("requiere permiso")
	})
	it("shows the correction reason without repeating the decision form", async () => {
		const html = await admin([
			{ ...account, status: "requires_attention", reviewReason: "El titular no coincide." },
		])
		expect(html).toContain("El titular no coincide.")
		expect(html).not.toContain("data-bank-review-form")
	})
	it("does not tell a provider to wait for deposits that were never initiated", async () => {
		const html = await provider([account])
		expect(html).toContain("Revisión del equipo")
		expect(html).not.toContain("Confirmar montos")
		expect(html).not.toContain("Calendario de liquidación")
		expect(html).not.toContain("NEVER_RENDER_FULL_ACCOUNT")
	})
	it("keeps principal selection explicit and only available for approved alternatives", async () => {
		expect(await provider([account])).not.toContain("Usar como principal")
		expect(await provider([{ ...account, status: "verified", isPrimary: false }])).toContain(
			"Usar como principal"
		)
		expect(await provider([{ ...account, status: "verified", isPrimary: true }])).not.toContain(
			"Usar como principal"
		)
	})
	it("exposes corrected submission and preserves past accounts", async () => {
		const html = await provider([
			{ ...account, status: "requires_attention", reviewReason: "Corrige el titular bancario." },
			{ ...account, id: "previous", status: "superseded" },
		])
		expect(html).toContain("Enviar cuenta corregida")
		expect(html).toContain("Corrige el titular bancario.")
		expect(html).toContain("Cuentas anteriores")
	})
})
