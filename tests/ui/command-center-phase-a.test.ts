import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("command-center phase A context and outcomes", () => {
	it("uses one queue-filter parser for the page and API and keeps provider scope", () => {
		const page = read("src/pages/admin/queues/[queueId].astro")
		const api = read("src/pages/api/admin/v1/queues/[queueId].ts")
		const queries = read("src/modules/casework/application/queries/command-center.ts")

		expect(page).toContain("parseCommandCenterQueueFilters")
		expect(api).toContain("parseCommandCenterQueueFilters")
		expect(queries).toContain("providerId?: string | null")
		expect(queries).toContain("eq(ComplianceCase.providerId, filters.providerId.trim())")
		expect(page).toContain("Volver al proveedor")
		expect(page).toContain("Ver todos los proveedores")
	})

	it("uses aggregate provider counts and does not infer them from the recent page", () => {
		const page = read("src/pages/admin/providers/[providerId]/index.astro")
		const queries = read("src/modules/casework/application/queries/command-center.ts")

		expect(queries).toContain("summarizeProviderCaseCounts(caseCounts)")
		expect(page).toContain("view.caseCounts.activeByDomain")
		expect(page).toContain("view.caseCounts.total")
		expect(page).toContain("100 expedientes más recientes")
	})

	it("reports waiting and returned proposals without claiming that the case was resolved", () => {
		const page = read("src/pages/admin/cases/[caseId]/index.astro")
		const command = read("src/modules/casework/application/commands/case-commands.ts")

		expect(command).toContain(
			'caseStatus: domainResult.deferred ? "waiting_information" : "resolved"'
		)
		expect(page).toContain("decision_waiting_information")
		expect(page).toContain("decision_returned")
		expect(page).toContain("El expediente espera información antes de continuar.")
	})

	it("links a case to an audit filter that actually understands the case", () => {
		const page = read("src/pages/admin/cases/[caseId]/index.astro")
		const audit = read("src/lib/audit/audit-console.ts")

		expect(page).toContain("caseId=${workspace.case.id}")
		expect(audit).toContain("caseId?: string")
		expect(audit).toContain('"CaseDecision"')
	})
})
