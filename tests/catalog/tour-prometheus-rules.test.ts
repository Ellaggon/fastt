import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

function read(rel: string) {
	return readFileSync(resolve(rel), "utf8")
}

describe("tours prometheus / alertmanager wiring (P2 C1)", () => {
	it("ships scrape + alertmanager fragments that load tours-rollout rules", () => {
		const rules = read("docs/ops/tours-rollout.rules.yml")
		const scrape = read("docs/ops/prometheus/prometheus.tours.scrape.yml")
		const alertmanager = read("docs/ops/prometheus/alertmanager.tours.receivers.yml")

		expect(scrape).toContain("/api/internal/observability/prometheus")
		expect(scrape).toContain("tours-rollout.rules.yml")
		expect(scrape).toContain("Bearer")
		expect(alertmanager).toContain("tours-rollout-ops")
		expect(alertmanager).toContain("vertical")

		for (const alert of [
			"ToursHoldConfirmBelowBaseline",
			"ToursHoldFailureRateHigh",
			"ToursRedeemIssuedBelowBaseline",
			"ToursRefundQuoteAppliedGap",
			"ToursRefundAmountMismatch",
			"ToursRolloutAlertFiring",
			"ToursRolloutMetricsCollectionError",
		]) {
			expect(rules).toContain(`alert: ${alert}`)
		}

		expect(rules).toContain('tours_rollout_alert{code="tours_hold_confirm_below_baseline"}')
		expect(rules).toContain("tours_rollout_alert_firing")
		expect(rules).toContain("tours_rollout_metrics_collection_error")
	})

	it("keeps prometheus endpoint wired to tours collectors", () => {
		const endpoint = read("src/pages/api/internal/observability/prometheus.ts")
		expect(endpoint).toContain("collectTourRolloutPrometheusMetrics")
		expect(endpoint).toContain("syncSharedTourCountersFromRedis")
		expect(endpoint).toContain("tours_rollout_metrics_collection_error")
	})
})
