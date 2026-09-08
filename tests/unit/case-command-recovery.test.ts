import { describe, expect, it } from "vitest"
import { prepareCaseCommand, canDiscardCaseCommand } from "@/modules/casework/command-recovery"

describe("recovery after an uncertain decision response", () => {
	it("replays the original payload and key after edits or a reload", () => {
		const sent = prepareCaseCommand(
			null,
			'{"decision":"approved","caseVersion":1}',
			() => "original"
		)
		const restored = JSON.parse(JSON.stringify(sent))
		expect(
			prepareCaseCommand(restored, '{"decision":"rejected","caseVersion":2}', () => "duplicate")
		).toEqual(sent)
	})
	it.each([500, 502, 503, 504])("retains an uncertain HTTP %s operation", (status) => {
		expect(canDiscardCaseCommand(status, "command_failed")).toBe(false)
	})
	it("keeps an in-progress operation but releases a definitive stale version", () => {
		expect(canDiscardCaseCommand(409, "idempotency_command_in_progress")).toBe(false)
		expect(canDiscardCaseCommand(409, "case_version_conflict")).toBe(true)
		expect(canDiscardCaseCommand(409, "case_evidence_changed")).toBe(true)
		expect(canDiscardCaseCommand(422, "decision_comment_required")).toBe(true)
	})
})
