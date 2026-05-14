import { describe, expect, it } from "vitest"

import { financialSourceFiles, read } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial GET endpoints stay read-only", () => {
	it("blocks writes inside financial GET route files", () => {
		const violations = financialSourceFiles.flatMap((file) => {
			if (!file.startsWith("src/pages/api/internal/financial/")) return []
			const source = read(file)
			if (!source.includes("export const GET")) return []
			return [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/].flatMap((pattern) =>
				pattern.test(source) ? [`${file}: GET endpoint contains write call ${pattern}`] : []
			)
		})
		expect(violations).toEqual([])
	})
})
