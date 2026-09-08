import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

describe("provider record phase B daily-work interface", () => {
	it("uses a human work vocabulary and removes the implementation notice", () => {
		const page = read("src/pages/admin/providers/[providerId]/index.astro")
		const queries = read("src/modules/casework/application/queries/command-center.ts")

		expect(queries).toContain("PROVIDER_WORK_VOCABULARY")
		expect(page).toContain("Ficha del proveedor")
		expect(page).toContain("Próxima acción")
		expect(page).toContain("Pendientes")
		expect(page).toContain("Historial reciente")
		expect(page).not.toContain("vista longitudinal")
		expect(page).not.toContain("La próxima iteración")
	})

	it("keeps identifiers secondary and gives people the correct scoped destinations", () => {
		const page = read("src/pages/admin/providers/[providerId]/index.astro")

		expect(page).toContain("data-copy-provider-id")
		expect(page).toContain("data-copy-label")
		expect(page).toContain("Copiar ID")
		expect(page).toContain("copyTextToClipboard")
		expect(page).toContain("providerId=${encodeURIComponent(view.provider.id)}")
		expect(page).toContain("Herramientas técnicas")
		expect(page).toContain("/admin/cases/${nextCase.id}")
	})
})
