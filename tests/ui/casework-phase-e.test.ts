import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("Fase E: validación y adopción del Centro de Mando", () => {
	it("mantiene los comandos dentro de una cohorte explícita tanto en UI como en API", () => {
		const page = read("src/pages/admin/cases/[caseId]/index.astro")
		expect(page).toContain("isCommandCenterV2PilotProvider")
		expect(page).toContain("Este proveedor está fuera del piloto de decisiones v2")
		for (const route of [
			"src/pages/api/admin/v1/cases/[caseId]/propose-decision.ts",
			"src/pages/api/admin/v1/cases/[caseId]/assign.ts",
			"src/pages/api/admin/v1/decisions/[decisionId]/approve.ts",
			"src/pages/api/admin/v1/decisions/[decisionId]/reject.ts",
		]) {
			expect(read(route)).toContain("casework_pilot_scope_required")
		}
	})

	it("documenta tareas ciegas, métricas, gate de salida y compatibilidad", () => {
		const plan = read("docs/command-center/phase-5-validation-adoption.md")
		for (const text of [
			"Datos de prueba clasificados",
			"Observación sin guía",
			"Error de contexto",
			"COMMAND_CENTER_V2_PILOT_PROVIDER_IDS",
			"COMMAND_CENTER_LEGACY_WRITE_ENABLED",
			"segundo control",
			"evidencia",
			"auditoría",
		])
			expect(plan).toContain(text)
	})
})
