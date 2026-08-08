/**
 * Persist a Tours canary observation snapshot for staging → allowlist → % windows.
 *
 * Modes:
 * - local (default): evaluate in-process counters + expansion gate → JSON artifact
 * - remote: GET /api/internal/observability/tours-rollout with bearer token
 *
 * Env:
 *   TOURS_CANARY_SNAPSHOT_OUT=artifacts/tours-canary/<stamp>.json
 *   TOURS_CANARY_SNAPSHOT_URL=https://host/api/internal/observability/tours-rollout
 *   FASTT_INFRA_HEALTH_TOKEN=...
 *   TOURS_CANARY_SNAPSHOT_LABEL=peak-window-1
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import {
	buildTourRolloutCohortComparison,
	evaluateTourRolloutExpansionGateAsync,
	getTourRolloutThresholds,
} from "../../src/lib/tours/tourObservability"
import {
	getTourProviderAllowlist,
	getTourRolloutPercent,
	getTourRolloutStage,
} from "../../src/lib/tours/tourRolloutCanary"
import { syncSharedTourCountersFromRedis } from "../../src/lib/tours/tourRolloutSharedStore"

type Snapshot = {
	ok: boolean
	capturedAt: string
	label: string
	source: "local" | "remote"
	stage: string
	providerAllowlistCount: number
	rolloutPercent: number
	thresholds: ReturnType<typeof getTourRolloutThresholds>
	canary: {
		expansion: {
			expand: boolean
			blockers: string[]
			dwell: {
				ready: boolean
				minDwellMs: number
				elapsedMs: number
				remainingMs: number
				enteredAtMs: number
			}
		}
	}
	cohorts: ReturnType<typeof buildTourRolloutCohortComparison>
	health: {
		status: string
		isHealthy: boolean
		reasons: string[]
		alerts: Array<{ code: string; severity: string; message: string }>
		ratios: Record<string, number>
		sampleHolds: number
		sampleConfirms: number
	}
	releaseChecks: {
		holdFailureOk: boolean
		holdConfirmOk: boolean
		redeemIssuedOk: boolean
		refundGapOk: boolean
		expandReady: boolean
	}
}

function stamp(): string {
	return new Date().toISOString().replace(/[:.]/g, "-")
}

function defaultOutPath(label: string): string {
	const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "window"
	return resolve(`artifacts/tours-canary/${stamp()}_${safe}.json`)
}

function releaseChecks(snapshot: Omit<Snapshot, "releaseChecks">): Snapshot["releaseChecks"] {
	const reasons = new Set(snapshot.health.reasons)
	const alertCodes = new Set(snapshot.health.alerts.map((a) => a.code))
	const blocked = (code: string) => reasons.has(code) || alertCodes.has(code)
	return {
		holdFailureOk: !blocked("tours_hold_failure_rate_high"),
		holdConfirmOk: !blocked("tours_hold_confirm_below_baseline"),
		redeemIssuedOk: !blocked("tours_redeem_issued_below_baseline"),
		refundGapOk:
			!blocked("tours_refund_quote_vs_applied_gap") && !blocked("tours_refund_amount_mismatch"),
		expandReady: snapshot.canary.expansion.expand === true && snapshot.health.status === "healthy",
	}
}

async function captureLocal(label: string): Promise<Snapshot> {
	await syncSharedTourCountersFromRedis().catch(() => null)
	const expansion = await evaluateTourRolloutExpansionGateAsync()
	const cohorts = buildTourRolloutCohortComparison()
	const health = expansion.health
	const base = {
		ok: true,
		capturedAt: new Date().toISOString(),
		label,
		source: "local" as const,
		stage: getTourRolloutStage(),
		providerAllowlistCount: getTourProviderAllowlist().size,
		rolloutPercent: getTourRolloutPercent(),
		thresholds: getTourRolloutThresholds(),
		canary: {
			expansion: {
				expand: expansion.expand,
				blockers: expansion.blockers,
				dwell: expansion.dwell,
			},
		},
		cohorts,
		health: {
			status: health.status,
			isHealthy: health.isHealthy,
			reasons: health.reasons,
			alerts: health.alerts.map((a) => ({
				code: a.code,
				severity: a.severity,
				message: a.message,
			})),
			ratios: { ...(health.summary.ratios as Record<string, number>) },
			sampleHolds: health.summary.holds.total,
			sampleConfirms: health.summary.confirms.total,
		},
	}
	return { ...base, releaseChecks: releaseChecks(base) }
}

async function captureRemote(label: string, url: string, token: string): Promise<Snapshot> {
	const response = await fetch(url, {
		headers: {
			accept: "application/json",
			authorization: `Bearer ${token}`,
		},
	})
	const payload = (await response.json().catch(() => ({}))) as any
	if (!response.ok) {
		throw new Error(
			`remote_snapshot_failed status=${response.status} body=${JSON.stringify(payload).slice(0, 400)}`
		)
	}
	const expansion = payload?.canary?.expansion ?? {}
	const health = payload?.health ?? {}
	const base = {
		ok: Boolean(payload?.ok),
		capturedAt: new Date().toISOString(),
		label,
		source: "remote" as const,
		stage: String(payload?.canary?.stage ?? payload?.stage ?? "unknown"),
		providerAllowlistCount: Number(payload?.canary?.providerAllowlistCount ?? 0),
		rolloutPercent: Number(payload?.canary?.rolloutPercent ?? 0),
		thresholds: getTourRolloutThresholds(),
		canary: {
			expansion: {
				expand: Boolean(expansion.expand),
				blockers: Array.isArray(expansion.blockers) ? expansion.blockers.map(String) : [],
				dwell: {
					ready: Boolean(expansion.dwell?.ready),
					minDwellMs: Number(expansion.dwell?.minDwellMs ?? 0),
					elapsedMs: Number(expansion.dwell?.elapsedMs ?? 0),
					remainingMs: Number(expansion.dwell?.remainingMs ?? 0),
					enteredAtMs: Number(expansion.dwell?.enteredAtMs ?? 0),
				},
			},
		},
		cohorts: payload?.cohorts ?? buildTourRolloutCohortComparison(),
		health: {
			status: String(health.status ?? payload?.status ?? "unknown"),
			isHealthy: Boolean(health.isHealthy),
			reasons: Array.isArray(health.reasons) ? health.reasons.map(String) : [],
			alerts: Array.isArray(health.alerts)
				? health.alerts.map((a: any) => ({
						code: String(a.code ?? ""),
						severity: String(a.severity ?? ""),
						message: String(a.message ?? ""),
					}))
				: [],
			ratios: (payload?.ratios ??
				health.ratios ??
				payload?.cohorts?.canary?.ratios ??
				{}) as Record<string, number>,
			sampleHolds: Number(payload?.cohorts?.canary?.holds ?? health.sampleHolds ?? 0),
			sampleConfirms: Number(payload?.cohorts?.canary?.confirms ?? health.sampleConfirms ?? 0),
		},
	}
	return { ...base, releaseChecks: releaseChecks(base) }
}

async function main() {
	const label = String(process.env.TOURS_CANARY_SNAPSHOT_LABEL ?? "observation").trim() || "observation"
	const out =
		String(process.env.TOURS_CANARY_SNAPSHOT_OUT ?? "").trim() || defaultOutPath(label)
	const remoteUrl = String(process.env.TOURS_CANARY_SNAPSHOT_URL ?? "").trim()
	const token = String(process.env.FASTT_INFRA_HEALTH_TOKEN ?? "").trim()

	const snapshot =
		remoteUrl.length > 0
			? await captureRemote(label, remoteUrl, token)
			: await captureLocal(label)

	mkdirSync(dirname(out), { recursive: true })
	writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8")

	const checks = snapshot.releaseChecks
	const line = [
		`wrote ${out}`,
		`stage=${snapshot.stage}`,
		`expand=${snapshot.canary.expansion.expand}`,
		`health=${snapshot.health.status}`,
		`holdFailOk=${checks.holdFailureOk}`,
		`holdConfirmOk=${checks.holdConfirmOk}`,
		`redeemOk=${checks.redeemIssuedOk}`,
		`refundGapOk=${checks.refundGapOk}`,
	].join(" ")
	console.log(line)

	if (process.env.TOURS_CANARY_SNAPSHOT_REQUIRE_EXPAND === "true" && !checks.expandReady) {
		console.error("expand_not_ready", snapshot.canary.expansion.blockers)
		process.exitCode = 2
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
