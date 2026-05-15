import { describe, expect, it } from "vitest"

import { read } from "./financial-stage2-guardrail-utils"

const mutationUseCases = [
	{
		file: "src/modules/financial/application/use-cases/acknowledge-financial-exception.ts",
		event: "exception_acknowledged",
		idempotentSignal: "event: null, idempotent: true",
	},
	{
		file: "src/modules/financial/application/use-cases/resolve-financial-exception.ts",
		event: "exception_resolved",
		idempotentSignal: "event: null, idempotent: true",
	},
	{
		file: "src/modules/financial/application/use-cases/dismiss-financial-exception.ts",
		event: "exception_dismissed",
		idempotentSignal: "event: null, idempotent: true",
	},
	{
		file: "src/modules/financial/application/use-cases/record-financial-reference.ts",
		event: "reference_added",
		idempotentSignal: "result.created",
	},
	{
		file: "src/modules/financial/application/use-cases/acknowledge-refund-handoff.ts",
		event: "refund_handoff_acknowledged",
		idempotentSignal: "event: null, idempotent: true",
	},
	{
		file: "src/modules/financial/application/use-cases/close-refund-handoff.ts",
		event: "refund_handoff_closed",
		idempotentSignal: "if (!handoff) return null",
	},
	{
		file: "src/modules/financial/application/use-cases/dismiss-refund-handoff.ts",
		event: "refund_handoff_dismissed",
		idempotentSignal: "if (!handoff) return null",
	},
]

describe("Guardrail: financial review event integrity", () => {
	it("requires one compact audit event for each valid Stage 2 mutation", () => {
		const violations = mutationUseCases.flatMap(({ file, event, idempotentSignal }) => {
			const source = read(file)
			const appendCount = (source.match(/deps\.events\.append\s*\(/g) ?? []).length
			return [
				appendCount === 1 ? null : `${file}: expected exactly one review event append`,
				source.includes(event) ? null : `${file}: missing ${event}`,
				source.includes(idempotentSignal)
					? null
					: `${file}: missing idempotent/no-duplicate event guard ${idempotentSignal}`,
				source.includes("reconstruct") || source.includes("replay")
					? `${file}: review events must not reconstruct workflow state`
					: null,
			].filter(Boolean)
		})
		expect(violations).toEqual([])
	})
})
