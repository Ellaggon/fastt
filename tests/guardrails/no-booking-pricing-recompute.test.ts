import { describe, expect, it } from "vitest"
import { scanFileWithRules, readSource, type GuardrailRule } from "./_guardrail-scanner"

const BOOKING_REPO_FILE =
	"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"

const BANNED_RULES: GuardrailRule[] = [
	{ name: "computeEffectivePricingV2 recompute", pattern: /\bcomputeEffectivePricingV2\s*\(/g },
	{
		name: "pricing coverage recompute",
		pattern: /\bensurePricingCoverage[A-Za-z0-9_]*\s*\(/g,
	},
	{ name: "recomputeEffectivePricingV2 usage", pattern: /\brecomputeEffectivePricingV2\s*\(/g },
	{ name: "previewPricingRules usage", pattern: /\bpreviewPricingRules\s*\(/g },
	{ name: "computePricePreview usage", pattern: /\bcomputePricePreview\s*\(/g },
	{ name: "legacy occupancy fallback", pattern: /\bsnapshot\.occupancy\s*\?\?/g },
]

describe("Guardrail: booking uses hold snapshot pricing only", () => {
	it("blocks pricing recompute and legacy occupancy fallback in booking materialization", () => {
		const source = readSource(BOOKING_REPO_FILE)
		const violations = scanFileWithRules(BOOKING_REPO_FILE, BANNED_RULES)

		expect(source).toContain("buildSnapshotFromHoldLifecycle")
		expect(source).toContain("Pricing total is sourced from the hold snapshot")
		expect(
			violations,
			`Found forbidden pricing recompute/fallback in booking materialization:\n${violations.join("\n")}`
		).toEqual([])
	})
})
