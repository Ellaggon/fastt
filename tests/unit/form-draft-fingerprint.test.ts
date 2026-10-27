import { expect, it } from "vitest"
import { formDraftFingerprint } from "@/lib/ui/form-draft-fingerprint"

it("does not mistake newly manufactured empty file controls for edits", () => {
	const first = new FormData()
	const next = new FormData()
	first.append("file", new File([], "", { lastModified: 1 }))
	next.append("file", new File([], "", { lastModified: 2 }))
	expect(formDraftFingerprint(first)).toBe(formDraftFingerprint(next))
})
it("detects an actual file selection and preserves multiple selected values", () => {
	const initial = new FormData()
	initial.append("departments", "BO-LP")
	const edited = new FormData()
	edited.append("departments", "BO-LP")
	edited.append("departments", "BO-OR")
	expect(formDraftFingerprint(initial)).not.toBe(formDraftFingerprint(edited))
	edited.append("file", new File(["document"], "evidence.pdf", { lastModified: 3 }))
	expect(formDraftFingerprint(edited)).toContain("evidence.pdf")
})
