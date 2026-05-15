import { describe, expect, it } from "vitest"

import { collectCallsInsideExportedConst, hasExportedConst } from "./_guardrail-ast"
import { financialSourceFiles } from "./financial-stage2-guardrail-utils"

describe("Guardrail: financial GET endpoints stay read-only", () => {
	it("blocks writes and workflow mutations inside exported financial GET handlers", () => {
		const forbiddenCalls = new Set([
			"insert",
			"update",
			"delete",
			"values",
			"create",
			"save",
			"resolve",
			"dismiss",
			"acknowledge",
			"close",
			"record",
		])
		const violations = financialSourceFiles.flatMap((file) => {
			if (!file.startsWith("src/pages/api/internal/financial/")) return []
			if (!hasExportedConst(file, "GET")) return []
			return collectCallsInsideExportedConst(file, "GET").flatMap((call) =>
				forbiddenCalls.has(call.leaf) &&
				(call.leaf !== "values" || call.calleePath.includes(".insert."))
					? [`${file}: GET handler calls forbidden mutation-like method ${call.calleePath}`]
					: []
			)
		})
		expect(violations).toEqual([])
	})
})
