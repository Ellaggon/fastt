import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("casework phase D decision recovery", () => {
	it("shows domain-compatible choices, required comments, and concrete effects", () => {
		const page = read("src/pages/admin/cases/[caseId]/index.astro")
		const command = read("src/modules/casework/application/commands/case-commands.ts")
		const evidence = read("src/components/admin/cases/CaseEvidencePanel.astro")

		expect(page).toContain("allowedDecisionValues")
		expect(page).toContain("data-requires-comment")
		expect(page).toContain("Efecto antes de decidir")
		expect(evidence).toContain("Criterios de decisión")
		expect(command).toContain("describeCaseDecisionEffect")
		expect(command).toContain("decision_not_supported_for_domain")
	})

	it("preserves a retry-safe draft and makes request and second-control states explicit", () => {
		const page = read("src/pages/admin/cases/[caseId]/index.astro")

		expect(page).toContain("casework:decision-draft")
		expect(page).toContain("Idempotency-Key")
		expect(page).toContain("misma clave")
		expect(page).toContain("Envío al proveedor: sin confirmación registrada")
		expect(page).toContain("Segundo control pendiente")
		expect(page).toContain("Recuperar propuesta")
		expect(page).toContain("Volver a los pendientes del proveedor")
	})
})
