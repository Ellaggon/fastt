import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

function read(path: string) {
	return readFileSync(resolve(process.cwd(), path), "utf8")
}

describe("Guardrail: booking uses hold snapshot pricing only", () => {
	it("blocks pricing recompute and legacy occupancy fallback in booking materialization", () => {
		const source = read(
			"src/modules/booking/infrastructure/repositories/BookingFromHoldRepository.ts"
		)

		expect(source).not.toMatch(/\bensurePricingCoverage\b/)
		expect(source).not.toMatch(/\brecomputeEffectivePricingV2Range\b/)
		expect(source).not.toMatch(/\bsnapshot\.occupancy\s*\?\?/)
		expect(source).toContain("Pricing total is sourced from the hold snapshot")
	})
})
