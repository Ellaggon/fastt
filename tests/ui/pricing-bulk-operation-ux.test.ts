import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(path, "utf8")

describe("pricing bulk operation UX", () => {
	it("keeps asynchronous pricing work visible and actionable", () => {
		const panel = read("src/components/pricing/PricingBulkJobOperationPanel.tsx")
		const multi = read("src/components/rates/MultiCalendarWorkspace.tsx")
		const single = read("src/components/rates/SingleCalendarWorkspace.tsx")

		expect(panel).toContain("Operación preparada")
		expect(panel).toContain("Progreso real")
		expect(panel).toContain("aplicadas")
		expect(panel).toContain("omitidas")
		expect(panel).toContain("Reintentar fallidas")
		expect(panel).toContain("Ver actividad de la operación")
		expect(multi).toContain('fetch("/api/pricing/bulk-jobs"')
		expect(multi).toContain("selection.ratePlanIds.length > 20")
		expect(single).toContain('fetch("/api/pricing/bulk-jobs"')
	})
})
