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
		expect(pkg.scripts["ops:tours-canary-p0"]).toContain("tours-canary-p0-release")
		expect(pkg.scripts["test:tours:playwright"]).toContain("playwright test")
		expect(pkg.scripts["ops:tours-prometheus-rules"]).toContain("validate-tours-prometheus-rules")
		expect(pkg.scripts["ops:tours-redis-multipod"]).toContain("tours-redis-multipod-check")
		expect(pkg.scripts["lint:tours"]).toContain("src/lib/tours")
		expect(pkg.scripts["test:tours:phase6"]).toContain("tour-slot-profile.test.ts")
		expect(pkg.scripts["test:tours:phase6"]).toContain("no-manual-occupancy-key.test.ts")
		expect(script).toContain("releaseChecks")
		expect(script).toContain("holdFailureOk")
		expect(script).toContain("holdConfirmOk")
		expect(script).toContain("redeemIssuedOk")
		expect(script).toContain("refundGapOk")
		expect(script).toContain("expandReady")
		expect(script).toContain("TOURS_CANARY_SNAPSHOT_REQUIRE_EXPAND")
		expect(runbook).toContain("ops:tours-canary-snapshot")
		expect(runbook).toContain("ops:tours-canary-p0")
		expect(runbook).toContain("docs/ops/tours-canary-evidence")
		expect(runbook).toContain("artifacts/tours-canary")
		expect(runbook).toContain("staging")
		expect(runbook).toContain("allowlist")
		expect(runbook).toContain("/booking/day-of")
		expect(workflow).toContain("pnpm run test:tours:phase6")
		expect(workflow).toContain("pnpm run lint:tours")
		expect(workflow).toContain("pnpm run build")
		expect(workflow).toContain("ops:tours-canary-snapshot")
		expect(workflow).toContain("test:tours:playwright")
		expect(workflow).toContain("ops:tours-prometheus-rules")
		expect(workflow).toContain("ops:tours-redis-multipod")
		expect(workflow).toContain("tour-slot-profile.test.ts")
		expect(workflow).toContain("no-manual-occupancy-key.test.ts")
		expect(existsSync(resolve("db/migrations/2026-08-20_tour_p2_trust_quality_private.sql"))).toBe(
			true
		)
		expect(existsSync(resolve("docs/ops/prometheus/prometheus.tours.scrape.yml"))).toBe(true)
		expect(existsSync(resolve("docs/ops/prometheus/alertmanager.tours.receivers.yml"))).toBe(true)
		expect(existsSync(resolve("scripts/ops/tours-canary-p0-release.ts"))).toBe(true)
		expect(existsSync(resolve("docs/ops/tours-canary-evidence/README.md"))).toBe(true)
		expect(existsSync(resolve("docs/ops/tours-canary-evidence/LATEST"))).toBe(true)
		expect(existsSync(resolve("playwright.config.ts"))).toBe(true)
		expect(existsSync(resolve("tests/e2e/tours-pdp-hold.smoke.spec.ts"))).toBe(true)
		expect(existsSync(resolve("tests/e2e/tours-day-of.smoke.spec.ts"))).toBe(true)
	})
})
