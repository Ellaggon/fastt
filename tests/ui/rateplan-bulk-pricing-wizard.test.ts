import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("ui/rateplan bulk pricing wizard", () => {
	it("rates/plans incluye selección múltiple y acción de edición masiva", () => {
		const source = read("src/pages/rates/plans/index.astro")
		expect(source).toContain("data-rateplan-checkbox")
		expect(source).toContain('id="bulkSelectAll"')
		expect(source).toContain('id="bulkEditOpenBtn"')
		expect(source).toContain("Operacion avanzada multi-plan")
		expect(source).toContain("window.location.href = `/pricing/bulk?")
		expect(source).not.toContain("window.location.href = `/rates/plans?")
	})

	it("wizard integra preview y apply con endpoints bulk v2", () => {
		const source = read("src/pages/pricing/bulk.astro")
		expect(source).toContain("Operacion avanzada de pricing")
		expect(source).toContain("el calendario de Pricing es la operacion diaria principal")
		expect(source).toContain("data-bulk-advanced-context")
		expect(source).toContain("Volver a Pricing")
		expect(source).toContain('id="bulkOperationType"')
		expect(source).toContain('id="bulkPreviewBtn"')
		expect(source).toContain('id="bulkApplyBtn"')
		expect(source).toContain('id="bulkExecutiveSummary"')
		expect(source).toContain('id="bulkPreviewSort"')
		expect(source).toContain("Aplicar cambios a tarifas seleccionadas")
		expect(source).toContain('fetch("/api/pricing/rules/v2/bulk-preview"')
		expect(source).toContain('fetch("/api/pricing/rules/v2/bulk-apply"')
	})

	it("muestra diffs y errores parciales en preview/apply", () => {
		const source = read("src/pages/pricing/bulk.astro")
		expect(source).toContain("changedDays")
		expect(source).toContain("totalDelta")
		expect(source).toContain("calculateRiskSignals")
		expect(source).toContain('id="bulkGlobalAlerts"')
		expect(source).toContain('id="bulkApplyConfirmation"')
		expect(source).toContain('id="bulkPreviewFailures"')
		expect(source).toContain('id="bulkResultFailures"')
	})

	it("pricing calendar exposes compact range operations without replacing daily edit", () => {
		const source = read("src/pages/pricing/index.astro")
		expect(source).toContain("Aplicar precio al rango")
		expect(source).toContain("noches seleccionadas")
		expect(source).toContain("data-pricing-range-date")
		expect(source).toContain("data-pricing-day-form")
		expect(source).toContain("/api/pricing/rules/v2/bulk-preview")
		expect(source).toContain("/api/pricing/rules/v2/bulk-apply")
		expect(source).toContain("setApplyNeedsConfirmation")
		expect(source).toContain("priority: 1000")
		expect(source).toContain('contextKey: "manual"')
	})
})
