import { describe, expect, it } from "vitest"
import { readSource } from "./_guardrail-scanner"
import { collectCalls, collectImports } from "./_guardrail-ast"

const BOOKING_REPO_FILE =
	"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"

const BANNED_CALLS = new Set([
	"computeEffectivePricingV2",
	"ensurePricingCoverage",
	"ensurePricingCoverageForRequest",
	"ensurePricingCoverageRuntime",
	"recomputeEffectivePricingV2",
	"previewPricingRules",
	"computePricePreview",
])

describe("Guardrail: booking uses hold snapshot pricing only", () => {
	it("blocks pricing recompute and legacy occupancy fallback in booking materialization", () => {
		const source = readSource(BOOKING_REPO_FILE)
		const imports = collectImports(BOOKING_REPO_FILE)
		const calls = collectCalls(BOOKING_REPO_FILE)
		const bannedLocals = new Set(
			imports.filter((entry) => BANNED_CALLS.has(entry.imported)).map((entry) => entry.local)
		)
		const violations: string[] = []
		for (const call of calls) {
			if (BANNED_CALLS.has(call.leaf) || bannedLocals.has(call.root)) {
				violations.push(`${BOOKING_REPO_FILE} -> ${call.calleePath}`)
			}
		}
		if (/\bsnapshot\.occupancy\s*\?\?/.test(source)) {
			violations.push(`${BOOKING_REPO_FILE} -> legacy occupancy fallback`)
		}

		expect(source).toContain("buildSnapshotFromHoldLifecycle")
		expect(source).toContain("Pricing total is sourced from the hold snapshot")
		expect(
			violations,
			`Found forbidden pricing recompute/fallback in booking materialization:\n${violations.join("\n")}`
		).toEqual([])
	})
})
