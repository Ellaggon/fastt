import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

describe("tours canary observation evidence (block 3)", () => {
	it("ships snapshot script + runbook peak-window persistence", () => {
		const script = readFileSync(resolve("scripts/ops/tours-canary-observation-snapshot.ts"), "utf8")
		const runbook = readFileSync(resolve("docs/engineering/tours-rollout-canary.md"), "utf8")
		const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
			scripts: Record<string, string>
		}
		const workflow = readFileSync(resolve(".github/workflows/tours.yml"), "utf8")

		expect(pkg.scripts["ops:tours-canary-snapshot"]).toContain(
			"tours-canary-observation-snapshot"
		)
		expect(pkg.scripts["lint:tours"]).toContain("src/lib/tours")
		expect(script).toContain("releaseChecks")
		expect(script).toContain("holdFailureOk")
		expect(script).toContain("holdConfirmOk")
		expect(script).toContain("redeemIssuedOk")
		expect(script).toContain("refundGapOk")
		expect(script).toContain("expandReady")
		expect(script).toContain("TOURS_CANARY_SNAPSHOT_REQUIRE_EXPAND")
		expect(runbook).toContain("ops:tours-canary-snapshot")
		expect(runbook).toContain("artifacts/tours-canary")
		expect(runbook).toContain("staging")
		expect(runbook).toContain("allowlist")
		expect(runbook).toContain("/booking/day-of")
		expect(workflow).toContain("pnpm run test:tours:phase6")
		expect(workflow).toContain("pnpm run lint:tours")
		expect(workflow).toContain("pnpm run build")
		expect(workflow).toContain("ops:tours-canary-snapshot")
		expect(existsSync(resolve("db/migrations/2026-08-20_tour_p2_trust_quality_private.sql"))).toBe(
			true
		)
	})
})
