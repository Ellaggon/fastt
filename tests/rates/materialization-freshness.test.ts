import { describe, expect, it } from "vitest"
import {
	evaluateMaterializationReadiness,
	evaluateMaterializationFreshness,
	formatFreshnessAge,
	summarizeMaterializationFreshness,
} from "@/lib/rates/materializationFreshness"

describe("materialization freshness", () => {
	const now = new Date("2026-05-21T12:00:00.000Z")

	it("reports fresh materializations with full coverage", () => {
		const result = evaluateMaterializationFreshness({
			label: "Restrictions",
			expectedRows: 2,
			timestamps: ["2026-05-21T11:55:00.000Z", "2026-05-21T11:58:00.000Z"],
			now,
		})

		expect(result.state).toBe("fresh")
		expect(result.coveragePercent).toBe(100)
		expect(result.summary).toBe("Actualizado hace 2 min")
	})

	it("reports delayed materializations when coverage is partial", () => {
		const result = evaluateMaterializationFreshness({
			label: "Search",
			expectedRows: 3,
			timestamps: ["2026-05-21T11:58:00.000Z"],
			now,
		})

		expect(result.state).toBe("delayed")
		expect(result.coveragePercent).toBe(33)
		expect(result.missingRows).toBe(2)
	})

	it("reports stale materializations by age threshold", () => {
		const result = evaluateMaterializationFreshness({
			label: "Pricing",
			expectedRows: 1,
			timestamps: ["2026-05-21T08:00:00.000Z"],
			now,
			staleAfterMinutes: 180,
		})

		expect(result.state).toBe("stale")
		expect(result.ageMinutes).toBe(240)
	})

	it("summarizes the worst health state without hiding coverage", () => {
		const fresh = evaluateMaterializationFreshness({
			label: "Pricing",
			expectedRows: 1,
			timestamps: ["2026-05-21T11:59:00.000Z"],
			now,
		})
		const missing = evaluateMaterializationFreshness({
			label: "Search",
			expectedRows: 1,
			timestamps: [],
			now,
		})

		const summary = summarizeMaterializationFreshness([fresh, missing])

		expect(summary.state).toBe("missing")
		expect(summary.coveragePercent).toBe(50)
	})

	it("formats compact operational ages", () => {
		expect(formatFreshnessAge(null)).toBe("sin materializar")
		expect(formatFreshnessAge(0)).toBe("ahora")
		expect(formatFreshnessAge(45)).toBe("hace 45 min")
		expect(formatFreshnessAge(90)).toBe("hace 1 h")
	})

	it("turns stale and missing rows into support readiness issues", () => {
		const fresh = evaluateMaterializationFreshness({
			label: "Precios",
			expectedRows: 2,
			timestamps: ["2026-05-21T11:58:00.000Z", "2026-05-21T11:59:00.000Z"],
			now,
		})
		const stale = evaluateMaterializationFreshness({
			label: "Busqueda",
			expectedRows: 2,
			timestamps: ["2026-05-21T08:00:00.000Z", "2026-05-21T08:00:00.000Z"],
			now,
			staleAfterMinutes: 180,
		})
		const missing = evaluateMaterializationFreshness({
			label: "Restricciones",
			expectedRows: 2,
			timestamps: [],
			now,
		})

		const readiness = evaluateMaterializationReadiness([fresh, stale, missing])

		expect(readiness.status).toBe("blocked")
		expect(readiness.statusLabel).toBe("Bloqueado")
		expect(readiness.totalMissingRows).toBe(2)
		expect(readiness.issues.map((issue) => issue.code)).toContain("stale_materialization")
		expect(readiness.issues.map((issue) => issue.code)).toContain("missing_materialization")
	})
})
