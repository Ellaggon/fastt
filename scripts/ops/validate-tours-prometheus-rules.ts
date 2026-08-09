/**
 * Validate docs/ops/tours-rollout.rules.yml references series that the app emits
 * (or scrape-side error gauges). Fail closed on unknown metric names.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { resetMetricsForTests } from "../../src/lib/observability/metrics"
import {
	collectTourRolloutPrometheusMetrics,
	recordTourConfirm,
	recordTourHold,
} from "../../src/lib/tours/tourObservability"
import { resetTourRolloutSharedStoreForTests } from "../../src/lib/tours/tourRolloutSharedStore"

const RULES_PATH = resolve("docs/ops/tours-rollout.rules.yml")
const SCRAPE_PATH = resolve("docs/ops/prometheus/prometheus.tours.scrape.yml")
const ALERTMANAGER_PATH = resolve("docs/ops/prometheus/alertmanager.tours.receivers.yml")

const ALWAYS_EMITTED = new Set([
	"tours_rollout_hold_to_confirm_ratio",
	"tours_rollout_redeem_issued_ratio",
	"tours_rollout_refund_quote_applied_ratio",
	"tours_rollout_hold_failure_ratio",
	"tours_rollout_confirm_failure_ratio",
	"tours_rollout_health",
	"tours_rollout_alert_firing",
	"tours_rollout_baseline_min_hold_confirm_rate",
	"tours_rollout_baseline_min_redeem_issued_rate",
	"tours_rollout_metrics_collection_error",
	"tours_rollout_alert",
])

function metricNamesFromExprLines(yaml: string): Set<string> {
	const names = new Set<string>()
	for (const line of yaml.split("\n")) {
		const trimmed = line.trim()
		if (!trimmed.startsWith("expr:")) continue
		// Strip label matchers so code="tours_*" values are not treated as metrics.
		const expr = trimmed
			.slice("expr:".length)
			.trim()
			.replace(/\{[^}]*\}/g, "")
		for (const match of expr.matchAll(/\b(tours_[a-z0-9_]+)\b/g)) {
			names.add(match[1])
		}
	}
	return names
}

function main() {
	const rules = readFileSync(RULES_PATH, "utf8")
	const scrape = readFileSync(SCRAPE_PATH, "utf8")
	const alertmanager = readFileSync(ALERTMANAGER_PATH, "utf8")

	if (!scrape.includes("/api/internal/observability/prometheus")) {
		throw new Error("scrape fragment missing prometheus path")
	}
	if (!scrape.includes("tours-rollout.rules.yml")) {
		throw new Error("scrape fragment must reference tours-rollout.rules.yml")
	}
	if (!alertmanager.includes("vertical")) {
		throw new Error("alertmanager fragment missing tours vertical route")
	}
	if (!alertmanager.includes("tours-rollout-ops")) {
		throw new Error("alertmanager fragment missing tours-rollout-ops receiver")
	}

	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
	process.env.TOURS_ROLLOUT_STAGE = "allowlist"
	process.env.TOURS_ROLLOUT_MIN_DWELL_MS = "0"
	for (let i = 0; i < 5; i++) {
		recordTourHold("success", undefined, { stage: "allowlist", cohort: "canary" })
		recordTourConfirm("success", undefined, { stage: "allowlist", cohort: "canary" })
	}

	const emitted = new Set(collectTourRolloutPrometheusMetrics().map((m) => m.name))
	emitted.add("tours_rollout_metrics_collection_error")
	const referenced = metricNamesFromExprLines(rules)
	const allowed = new Set([...ALWAYS_EMITTED, ...emitted])
	const unknown = [...referenced].filter((name) => !allowed.has(name))

	if (unknown.length) {
		throw new Error(`rules reference unknown metrics: ${unknown.join(", ")}`)
	}

	for (const required of [
		"tours_rollout_alert",
		"tours_rollout_alert_firing",
		"tours_rollout_metrics_collection_error",
	]) {
		if (!referenced.has(required)) {
			throw new Error(`rules missing required metric ${required}`)
		}
	}

	const alertCount = (rules.match(/^\s*- alert:/gm) || []).length
	if (alertCount < 6) {
		throw new Error(`expected >=6 tours alerts, found ${alertCount}`)
	}
	console.log(`tours_prometheus_rules_ok alerts=${alertCount} metrics_checked=${referenced.size}`)
}

main()
