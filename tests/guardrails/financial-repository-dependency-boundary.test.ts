import { describe, expect, it } from "vitest"

import { collectImports } from "./_guardrail-ast"
import { financialSourceFiles } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial Stage 2 dependency boundary", () => {
	it("blocks financial repositories and use-cases from importing runtime ownership modules", () => {
		const guardedFiles = financialSourceFiles.filter(
			(file) =>
				file.startsWith("src/modules/financial/application/") ||
				file.startsWith("src/modules/financial/infrastructure/repositories/")
		)
		const forbiddenModules = [
			/\/modules\/pricing\//,
			/\/lib\/pricing\//,
			/\/modules\/inventory\//,
			/\/lib\/inventory\//,
			/\/modules\/booking\/(application|infrastructure)\//,
			/\/modules\/payout/i,
			/\/modules\/payments?\//i,
			/\/modules\/accounting\//i,
		]
		const violations = guardedFiles.flatMap((file) =>
			collectImports(file).flatMap((entry) =>
				forbiddenModules.some((pattern) => pattern.test(entry.module))
					? [`${file}: imports forbidden runtime dependency ${entry.module}`]
					: []
			)
		)
		expect(violations).toEqual([])
	})
})
