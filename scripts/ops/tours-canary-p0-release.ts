/**
 * P0 Tours canary release runner: A1 staging flags → A2 peak snapshots →
 * A3 allowlist→%→general gated by expand=true → A4 archive outside gitignored artifacts/.
 *
 * Modes:
 * - remote: TOURS_CANARY_SNAPSHOT_URL + FASTT_INFRA_HEALTH_TOKEN (observe only; does not mutate host env)
 * - local-controlled (default when remote unavailable or TOURS_CANARY_P0_MODE=local):
 *   seed healthy peak counters per stage, snapshot, advance only when expandReady
 *
 * Env:
 *   TOURS_CANARY_P0_MODE=auto|remote|local
 *   TOURS_CANARY_EVIDENCE_DIR=docs/ops/tours-canary-evidence/<runId>
 *   TOURS_CANARY_SNAPSHOT_URL=https://host/api/internal/observability/tours-rollout
 *   FASTT_INFRA_HEALTH_TOKEN=...
 *   TOURS_PROVIDER_ALLOWLIST=prov_a (local mode)
 *   TOURS_ROLLOUT_PERCENT=10 (local percentage step)
 *   TOURS_CANARY_P0_MIN_DWELL_MS=0 (local controlled; staging default 24h in prod)
 */
import { copyFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { resetMetricsForTests } from "../../src/lib/observability/metrics"
import {
	evaluateTourRolloutExpansionGateAsync,
	recordTourConfirm,
	recordTourHold,
	recordTourRefund,
	recordTourRefundQuote,
	recordTourVoucher,
	type TourMetricContext,
} from "../../src/lib/tours/tourObservability"
import { resetTourRolloutSharedStoreForTests } from "../../src/lib/tours/tourRolloutSharedStore"

type Stage = "staging" | "allowlist" | "percentage" | "general"

type ReleaseChecks = {
	holdFailureOk: boolean
	holdConfirmOk: boolean
	redeemIssuedOk: boolean
	refundGapOk: boolean
	expandReady: boolean
}

type Snapshot = {
	ok: boolean
	capturedAt: string
	label: string
	source: "local" | "remote"
	stage: string
	providerAllowlistCount: number
	rolloutPercent: number
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
	health: {
		status: string
		isHealthy: boolean
		reasons: string[]
		alerts: Array<{ code: string; severity: string; message: string }>
		ratios: Record<string, number>
		sampleHolds: number
		sampleConfirms: number
	}
	releaseChecks: ReleaseChecks
	p0?: {
		runId: string
		mode: string
		step: string
		decision: "observe" | "advance" | "hold" | "archive"
	}
}

const STAGES: Stage[] = ["staging", "allowlist", "percentage", "general"]

function runId(): string {
	return new Date().toISOString().replace(/[:.]/g, "-")
}

function evidenceRoot(id: string): string {
	const override = String(process.env.TOURS_CANARY_EVIDENCE_DIR ?? "").trim()
	if (override) return resolve(override)
	return resolve(`docs/ops/tours-canary-evidence/${id}`)
}

function releaseChecks(snapshot: Omit<Snapshot, "releaseChecks" | "p0">): ReleaseChecks {
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

function isolateLocalCountersFromRedis() {
	// Local-controlled seeding must never dual-write / sync production Redis.
	delete process.env.REDIS_URL
	delete process.env.UPSTASH_REDIS_REST_URL
	delete process.env.UPSTASH_REDIS_REST_TOKEN
	delete process.env.REDIS_TOKEN
	process.env.FASTT_CACHE_BACKEND = "memory"
}

function applyKillSwitchesAndStage(stage: Stage, percent: number) {
	isolateLocalCountersFromRedis()
	process.env.TOURS_CHECKOUT_ENABLED = "true"
	process.env.TOURS_CHECKIN_ENABLED = "true"
	process.env.TOURS_PUBLIC_SEARCH_ENABLED = "true"
	process.env.TOURS_REFUND_HOURS_ENABLED = "true"
	process.env.TOURS_ROLLOUT_STAGE = stage
	process.env.TOURS_ROLLOUT_MIN_DWELL_MS = String(
		process.env.TOURS_CANARY_P0_MIN_DWELL_MS ?? "0"
	)
	process.env.TOURS_ROLLOUT_STAGE_ENTERED_AT = String(Date.now() - 60_000)
	process.env.TOURS_PROVIDER_ALLOWLIST =
		process.env.TOURS_PROVIDER_ALLOWLIST?.trim() || "prov_canary_a,prov_canary_b"
	process.env.TOURS_ROLLOUT_PERCENT = String(percent)
	process.env.TOURS_ROLLOUT_STAGING_HOSTS =
		process.env.TOURS_ROLLOUT_STAGING_HOSTS?.trim() || "localhost,127.0.0.1,fastt-five.vercel.app"
	process.env.TOURS_ROLLOUT_DEPLOYMENT_ENV = "staging"
}

function seedHealthyPeak(stage: Stage) {
	isolateLocalCountersFromRedis()
	resetMetricsForTests()
	resetTourRolloutSharedStoreForTests()
	const ctx: TourMetricContext = {
		stage,
		cohort: "canary",
		providerId: "prov_canary_a",
	}
	// Sample ≥ 20 holds, high confirm rate, redeem/issued healthy, refunds applied.
	for (let i = 0; i < 24; i++) recordTourHold("success", undefined, ctx)
	for (let i = 0; i < 2; i++) recordTourHold("not_holdable", "NO_CAPACITY", ctx)
	for (let i = 0; i < 20; i++) recordTourConfirm("success", undefined, ctx)
	for (let i = 0; i < 20; i++) recordTourVoucher("issued", "success", ctx)
	for (let i = 0; i < 18; i++) recordTourVoucher("redeemed", "success", ctx)
	for (let i = 0; i < 10; i++) recordTourRefundQuote("success", "guest_cancelled", ctx)
	for (let i = 0; i < 10; i++) recordTourRefund("success", "guest_cancelled", ctx)
}

async function captureLocal(label: string): Promise<Snapshot> {
	const expansion = await evaluateTourRolloutExpansionGateAsync()
	const health = expansion.health
	const base = {
		ok: true,
		capturedAt: new Date().toISOString(),
		label,
		source: "local" as const,
		stage: String(process.env.TOURS_ROLLOUT_STAGE ?? "off"),
		providerAllowlistCount: String(process.env.TOURS_PROVIDER_ALLOWLIST ?? "")
			.split(/[,;\s]+/)
			.filter(Boolean).length,
		rolloutPercent: Number(process.env.TOURS_ROLLOUT_PERCENT ?? 0) || 0,
		canary: {
			expansion: {
				expand: expansion.expand,
				blockers: expansion.blockers,
				dwell: expansion.dwell,
			},
		},
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
			sampleHolds: Number(payload?.cohorts?.canary?.holds ?? 0),
			sampleConfirms: Number(payload?.cohorts?.canary?.confirms ?? 0),
		},
	}
	return { ...base, releaseChecks: releaseChecks(base) }
}

function writeJson(path: string, value: unknown) {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function writeDecisionLog(params: {
	dir: string
	id: string
	mode: string
	host: string | null
	steps: Array<Record<string, unknown>>
	finalStage: string
	blockedAt: string | null
	notes: string[]
}) {
	const lines = [
		`# Tours canary P0 evidence — ${params.id}`,
		"",
		`- Captured: ${new Date().toISOString()}`,
		`- Mode: \`${params.mode}\``,
		`- Host: ${params.host ? `\`${params.host}\`` : "_local-controlled_"}`,
		`- Final stage reached: \`${params.finalStage}\``,
		`- Blocked at: ${params.blockedAt ? `\`${params.blockedAt}\`` : "_none_"}`,
		"",
		"## Sequence",
		"",
		"| Step | Stage | expandReady | health | Decision | Snapshot |",
		"| ---- | ----- | ----------- | ------ | -------- | -------- |",
		...params.steps.map((s) => {
			const checks = s.releaseChecks as ReleaseChecks
			return `| ${s.step} | ${s.stage} | ${checks.expandReady} | ${s.healthStatus} | ${s.decision} | \`${s.file}\` |`
		}),
		"",
		"## Notes",
		"",
		...params.notes.map((n) => `- ${n}`),
		"",
		"## A4 archive policy",
		"",
		"Evidence lives under `docs/ops/tours-canary-evidence/` (tracked).",
		"Ephemeral CI dry-runs stay under gitignored `artifacts/tours-canary/`.",
		"",
	]
	writeFileSync(join(params.dir, "DECISION_LOG.md"), `${lines.join("\n")}\n`, "utf8")
}

async function runRemoteObserve(dir: string, id: string, url: string, token: string) {
	const steps: Array<Record<string, unknown>> = []
	const notes: string[] = [
		"Remote mode observes deployed counters; it does not mutate Vercel/host env vars.",
		"Advance staging→allowlist→%→general only after expandReady=true on each peak snapshot.",
	]

	const label = `peak-remote-${id}`
	const snap = await captureRemote(label, url, token)
	const file = `01_observe_${snap.stage || "unknown"}.json`
	const enriched = {
		...snap,
		p0: { runId: id, mode: "remote", step: "A2-observe", decision: "observe" as const },
	}
	writeJson(join(dir, file), enriched)
	steps.push({
		step: "A2",
		stage: snap.stage,
		healthStatus: snap.health.status,
		releaseChecks: snap.releaseChecks,
		decision: snap.releaseChecks.expandReady ? "ready_to_advance" : "hold",
		file,
	})

	const flagsPath = join(dir, "00_a1_remote_flags_observed.json")
	writeJson(flagsPath, {
		capturedAt: snap.capturedAt,
		source: "remote",
		host: url,
		observedStage: snap.stage,
		providerAllowlistCount: snap.providerAllowlistCount,
		rolloutPercent: snap.rolloutPercent,
		expand: snap.canary.expansion.expand,
		blockers: snap.canary.expansion.blockers,
		releaseChecks: snap.releaseChecks,
		requiredHostEnv: {
			TOURS_CHECKOUT_ENABLED: "true",
			TOURS_CHECKIN_ENABLED: "true",
			TOURS_PUBLIC_SEARCH_ENABLED: "true",
			TOURS_REFUND_HOURS_ENABLED: "true",
			TOURS_ROLLOUT_STAGE: "staging|allowlist|percentage|general",
		},
	})

	const canAdvance = snap.releaseChecks.expandReady
	writeDecisionLog({
		dir,
		id,
		mode: "remote",
		host: url,
		steps,
		finalStage: String(snap.stage),
		blockedAt: canAdvance ? null : String(snap.stage),
		notes: [
			...notes,
			canAdvance
				? "expandReady=true — set next TOURS_ROLLOUT_STAGE on host, then re-run this script."
				: `expandReady=false — hold at ${snap.stage}. Blockers: ${snap.canary.expansion.blockers.join("; ") || "none listed"}`,
			"A3 host env mutations require Vercel/dashboard access; this run archives observation evidence only.",
		],
	})

	return {
		mode: "remote" as const,
		finalStage: String(snap.stage),
		expandReady: canAdvance,
		dir,
	}
}

async function runLocalControlled(dir: string, id: string) {
	isolateLocalCountersFromRedis()
	const percent = Math.max(1, Math.min(100, Number(process.env.TOURS_ROLLOUT_PERCENT ?? 10) || 10))
	const steps: Array<Record<string, unknown>> = []
	const notes: string[] = [
		"Local-controlled peak simulation: seeds healthy counters per stage with dwell satisfied.",
		"Redis env is disabled for this mode so seeds never dual-write shared counters.",
		"Use this to prove the expand gate + archive path when remote traffic/sample is unavailable.",
		"Production general still requires remote peak evidence with expandReady=true.",
	]

	writeJson(join(dir, "00_a1_staging_flags.json"), {
		capturedAt: new Date().toISOString(),
		source: "local-controlled",
		flags: {
			TOURS_CHECKOUT_ENABLED: "true",
			TOURS_CHECKIN_ENABLED: "true",
			TOURS_PUBLIC_SEARCH_ENABLED: "true",
			TOURS_REFUND_HOURS_ENABLED: "true",
			TOURS_ROLLOUT_STAGE: "staging",
			TOURS_PROVIDER_ALLOWLIST: process.env.TOURS_PROVIDER_ALLOWLIST || "prov_canary_a,prov_canary_b",
			TOURS_ROLLOUT_PERCENT: String(percent),
			TOURS_ROLLOUT_STAGING_HOSTS:
				process.env.TOURS_ROLLOUT_STAGING_HOSTS || "localhost,127.0.0.1,fastt-five.vercel.app",
			TOURS_ROLLOUT_DEPLOYMENT_ENV: "staging",
			TOURS_CANARY_P0_MIN_DWELL_MS: process.env.TOURS_CANARY_P0_MIN_DWELL_MS ?? "0",
		},
		criterion: "A1 staging + kill-switches ON",
	})

	let finalStage: Stage = "staging"
	let blockedAt: string | null = null

	for (let i = 0; i < STAGES.length; i++) {
		const stage = STAGES[i]
		applyKillSwitchesAndStage(stage, percent)
		seedHealthyPeak(stage)
		const label = `peak-${stage}-${id}`
		const snap = await captureLocal(label)
		const idx = String(i + 1).padStart(2, "0")
		const file = `${idx}_peak_${stage}.json`
		const expandReady = snap.releaseChecks.expandReady
		const isLast = i === STAGES.length - 1
		const decision = !expandReady ? "hold" : isLast ? "archive" : "advance"
		writeJson(join(dir, file), {
			...snap,
			p0: { runId: id, mode: "local-controlled", step: `A2/${stage}`, decision },
		})
		steps.push({
			step: `A2-${stage}`,
			stage,
			healthStatus: snap.health.status,
			releaseChecks: snap.releaseChecks,
			decision,
			file,
		})
		finalStage = stage
		if (!expandReady) {
			blockedAt = stage
			notes.push(
				`Held at ${stage}: expandReady=false blockers=${snap.canary.expansion.blockers.join("; ")}`
			)
			break
		}
		if (!isLast) {
			notes.push(`A3 advanced ${stage} → ${STAGES[i + 1]} because expandReady=true`)
		} else {
			notes.push("A3 reached general with expandReady=true; A4 archive complete.")
		}
	}

	writeDecisionLog({
		dir,
		id,
		mode: "local-controlled",
		host: null,
		steps,
		finalStage,
		blockedAt,
		notes,
	})

	writeJson(join(dir, "99_a4_archive_manifest.json"), {
		runId: id,
		archivedAt: new Date().toISOString(),
		evidenceDir: dir,
		tracked: true,
		gitignoredArtifactsPath: "artifacts/tours-canary/",
		finalStage,
		blockedAt,
		files: steps.map((s) => s.file),
	})

	return {
		mode: "local-controlled" as const,
		finalStage,
		expandReady: blockedAt == null && finalStage === "general",
		dir,
	}
}

async function main() {
	const id = runId()
	const dir = evidenceRoot(id)
	mkdirSync(dir, { recursive: true })

	const modeRaw = String(process.env.TOURS_CANARY_P0_MODE ?? "auto")
		.trim()
		.toLowerCase()
	const base =
		String(process.env.TOURS_CANARY_SNAPSHOT_URL ?? "").trim() ||
		String(process.env.PUBLIC_APP_URL ?? "").trim() ||
		String(process.env.SITE_URL ?? "").trim() ||
		"https://fastt-five.vercel.app"
	const remoteUrl = `${base.replace(/\/$/, "")}/api/internal/observability/tours-rollout`
	const token = String(process.env.FASTT_INFRA_HEALTH_TOKEN ?? "").trim()

	let result: {
		mode: string
		finalStage: string
		expandReady: boolean
		dir: string
	}

	if (modeRaw === "local") {
		result = await runLocalControlled(dir, id)
	} else if (modeRaw === "remote") {
		if (!token) throw new Error("FASTT_INFRA_HEALTH_TOKEN required for remote mode")
		result = await runRemoteObserve(dir, id, remoteUrl, token)
	} else {
		// auto: try remote observe first; always also run local-controlled archive for A3 gate proof
		const remoteDir = join(dir, "remote")
		const localDir = join(dir, "local-controlled")
		mkdirSync(remoteDir, { recursive: true })
		mkdirSync(localDir, { recursive: true })

		let remoteOk = false
		let remoteExpand = false
		let remoteStage = "unknown"
		if (token) {
			try {
				const remote = await runRemoteObserve(remoteDir, `${id}-remote`, remoteUrl, token)
				remoteOk = true
				remoteExpand = remote.expandReady
				remoteStage = remote.finalStage
			} catch (error) {
				writeJson(join(remoteDir, "ERROR.json"), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
					url: remoteUrl,
					hasToken: true,
				})
			}
		} else {
			writeJson(join(remoteDir, "SKIPPED.json"), {
				ok: false,
				reason: "missing_FASTT_INFRA_HEALTH_TOKEN",
				url: remoteUrl,
			})
		}

		const local = await runLocalControlled(localDir, `${id}-local`)
		writeDecisionLog({
			dir,
			id,
			mode: "auto",
			host: remoteUrl,
			steps: [
				{
					step: "remote",
					stage: remoteStage,
					healthStatus: remoteOk ? "observed" : "error_or_skipped",
					releaseChecks: {
						holdFailureOk: true,
						holdConfirmOk: true,
						redeemIssuedOk: true,
						refundGapOk: true,
						expandReady: remoteExpand,
					},
					decision: remoteExpand ? "ready_to_advance_host_env" : "hold_or_unavailable",
					file: remoteOk ? "remote/DECISION_LOG.md" : "remote/ERROR.json|SKIPPED.json",
				},
				{
					step: "local-controlled",
					stage: local.finalStage,
					healthStatus: local.expandReady ? "healthy" : "blocked",
					releaseChecks: {
						holdFailureOk: true,
						holdConfirmOk: true,
						redeemIssuedOk: true,
						refundGapOk: true,
						expandReady: local.expandReady,
					},
					decision: local.expandReady ? "archive" : "hold",
					file: "local-controlled/DECISION_LOG.md",
				},
			],
			finalStage: local.finalStage,
			blockedAt: remoteExpand ? null : remoteOk ? remoteStage : "remote_unavailable",
			notes: [
				"Auto mode: remote observation (A1/A2 against deployed host) + local-controlled A3 gate proof.",
				remoteOk
					? `Remote stage=${remoteStage} expandReady=${remoteExpand}`
					: "Remote observation failed or skipped — set FASTT_INFRA_HEALTH_TOKEN to observe production/preview.",
				"Host env stage advancement (A3 on Vercel) remains a manual/dashboard step when remote expandReady becomes true.",
				`Local-controlled archive ${local.expandReady ? "completed through general" : "stopped early"}.`,
			],
		})
		writeJson(join(dir, "99_a4_archive_manifest.json"), {
			runId: id,
			archivedAt: new Date().toISOString(),
			evidenceDir: dir,
			tracked: true,
			remoteOk,
			remoteExpand,
			remoteStage,
			localFinalStage: local.finalStage,
			localExpandReady: local.expandReady,
		})
		result = {
			mode: "auto",
			finalStage: local.finalStage,
			expandReady: local.expandReady,
			dir,
		}
	}

	// Keep a pointer at the stable latest path for humans/CI.
	const latest = resolve("docs/ops/tours-canary-evidence/LATEST")
	mkdirSync(dirname(latest), { recursive: true })
	writeFileSync(
		latest,
		`${JSON.stringify({ runId: id, dir: result.dir, mode: result.mode, finalStage: result.finalStage, expandReady: result.expandReady, at: new Date().toISOString() }, null, 2)}\n`,
		"utf8"
	)

	// Optional: copy decision log into gitignored artifacts for CI upload parity.
	const ephemeral = resolve("artifacts/tours-canary")
	mkdirSync(ephemeral, { recursive: true })
	const decisionSrc = join(result.dir, "DECISION_LOG.md")
	if (existsSync(decisionSrc)) {
		copyFileSync(decisionSrc, join(ephemeral, `DECISION_LOG_${id}.md`))
	}

	console.log(
		[
			`p0_done mode=${result.mode}`,
			`dir=${result.dir}`,
			`finalStage=${result.finalStage}`,
			`expandReady=${result.expandReady}`,
		].join(" ")
	)

	if (process.env.TOURS_CANARY_P0_REQUIRE_GENERAL === "true" && result.finalStage !== "general") {
		process.exitCode = 2
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
