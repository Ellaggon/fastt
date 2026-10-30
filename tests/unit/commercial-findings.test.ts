import { expect, it } from "vitest"
import { classifyCommercialFinding } from "@/lib/commercial-policy/findings"

it("separates provider context from unknown platform coverage", () => {
	expect(classifyCommercialFinding({ id: "policy_context_missing_tax" }).owner).toBe("provider")
	expect(classifyCommercialFinding({ id: "policy_context_unsupported_product" }).owner).toBe("fastt")
	expect(classifyCommercialFinding({ id: "policy_context_conflict_product" }).category).toBe("configuration")
})
it("does not request resubmission of evidence under review", () => {
	expect(classifyCommercialFinding({ id: "requirement_guide", evidenceState: "pending_review" }).waiting).toBe(true)
	expect(classifyCommercialFinding({ id: "requirement_guide", evidenceState: "expired" }).owner).toBe("provider")
})
