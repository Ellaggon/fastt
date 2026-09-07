import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("provider record phase C operational evidence", () => {
	it("derives visible operational state from owned evidence sources", () => {
		const query = read("src/modules/casework/application/queries/command-center.ts")
		const page = read("src/pages/admin/providers/[providerId]/index.astro")

		expect(query).toContain("getProviderOperationalSnapshot")
		expect(query).toContain("ProviderVerification")
		expect(query).toContain("getProviderTaxConfiguration")
		expect(query).toContain("listProviderDocuments")
		expect(query).toContain("listProviderPaymentAccounts")
		expect(query).toContain("reconciliation_needed")
		expect(page).toContain("Estado por área")
		expect(page).toContain("Fuente:")
		expect(page).toContain("Evaluada:")
		expect(page).toContain("Falta:")
	})

	it("keeps collections, account validation, and payout execution distinct", () => {
		const query = read("src/modules/casework/application/queries/command-center.ts")
		const page = read("src/pages/admin/providers/[providerId]/index.astro")

		expect(query).toContain("Sin fuente de ejecución de desembolsos")
		expect(query).toContain("La validación de cuenta no confirma")
		expect(page).toContain("Cobros en la plataforma")
		expect(page).toContain("Validación de cuenta para desembolsos")
		expect(page).toContain("Disponibilidad de desembolsos")
	})
})
