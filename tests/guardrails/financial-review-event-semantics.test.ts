import { describe, expect, it } from "vitest"

import { financialSourceFiles, read } from "./financial-stage2-guardrail-utils"

const reviewEventDomain = "src/modules/financial/domain/financial-review-event.ts"

describe("Guardrail: financial review events remain audit trail only", () => {
	it("blocks state reconstruction and orchestration semantics around review events", () => {
		const source = financialSourceFiles.map((file) => `// ${file}\n${read(file)}`).join("\n")
		const domain = read(reviewEventDomain)
		const requiredEvents = [
			"exception_acknowledged",
			"exception_resolved",
			"exception_dismissed",
			"reference_added",
			"refund_handoff_acknowledged",
			"refund_handoff_closed",
			"refund_handoff_dismissed",
		]
		const forbidden = [
			/replayFinancialEvents/,
			/rebuildFinancialState/,
			/reconstructFinancialState/,
			/eventSourcing/i,
			/orchestration log/i,
			/reconciliation engine/i,
		]
		const violations = [
			...requiredEvents.flatMap((event) =>
				domain.includes(event) ? [] : [`${reviewEventDomain}: missing ${event}`]
			),
			...forbidden.flatMap((pattern) =>
				pattern.test(source) ? [`Financial review event drift ${pattern}`] : []
			),
		]
		expect(violations).toEqual([])
	})
})
