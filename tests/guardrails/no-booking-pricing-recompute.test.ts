import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Guardrail: booking uses hold snapshot pricing only", () => {
	it("blocks pricing recompute and legacy occupancy fallback in booking materialization", () => {
		const source = read("src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts")

		expect(source).toContain("buildSnapshotFromHoldLifecycle")
		expect(source).toContain("Pricing total is sourced from the hold snapshot")

		expect(source).not.toMatch(/\bcomputeEffectivePricingV2\s*\()/)
		expect(source).not.toMatch(/\bensurePricingCoverage[A-Za-z0-9_]*\s*\()/)
		expect(source).not.toMatch(/\brecomputeEffectivePricingV2\s*\()/)
		expect(source).not.toMatch(/\bpreviewPricingRules\s*\()/)
		expect(source).not.toMatch(/\bcomputePricePreview\s*\()/)
		expect(source).not.toMatch(/\bsnapshot\.occupancy\s*\?\?/)
	})
})
