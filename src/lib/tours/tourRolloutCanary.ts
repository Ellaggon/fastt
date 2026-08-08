/**
 * Progressive Tours canary: staging → provider allowlist → percentage → general.
 * Kill-switches remain env-only; this gate only applies when the switch is on.
 */
import type { FeatureFlagContext } from "@/config/featureFlags"

export type TourRolloutStage = "off" | "staging" | "allowlist" | "percentage" | "general"

export type TourCanarySubject = {
	providerId?: string | null
	/** Session / user id for public-search percentage bucketing. */
	subjectId?: string | null
	host?: string | null
	deploymentEnv?: string | null
	env?: Record<string, string | undefined> | null
}

export type TourCanaryDecision = {
	enabled: boolean
	stage: TourRolloutStage
	reason:
		| "kill_switch_off"
		| "stage_off"
		| "staging_mismatch"
		| "not_allowlisted"
		| "outside_percentage"
		| "missing_subject"
		| "enabled"
}

function envMap(subject?: TourCanarySubject): Record<string, string | undefined> {
	return subject?.env ?? (process.env as Record<string, string | undefined>)
}

function readEnv(key: string, subject?: TourCanarySubject): string {
	const value = envMap(subject)[key]
	return value == null ? "" : String(value).trim()
}

export function parseTourRolloutStage(raw: string | undefined | null): TourRolloutStage {
	const normalized = String(raw ?? "")
		.trim()
		.toLowerCase()
	if (
		normalized === "off" ||
		normalized === "staging" ||
		normalized === "allowlist" ||
		normalized === "percentage" ||
		normalized === "general"
	) {
		return normalized
	}
	// Fail-closed: empty / typo must not silently enable general traffic.
	return "off"
}

/** Provider is in the commerce allowlist for the current canary stage. */
export function isTourProviderAllowlisted(
	providerId: string | null | undefined,
	subject?: TourCanarySubject
): boolean {
	const id = String(providerId ?? "").trim()
	if (!id) return false
	return getTourProviderAllowlist(subject).has(id)
}

export function getTourRolloutStage(subject?: TourCanarySubject): TourRolloutStage {
	return parseTourRolloutStage(readEnv("TOURS_ROLLOUT_STAGE", subject))
}

export function getTourProviderAllowlist(subject?: TourCanarySubject): Set<string> {
	const raw = readEnv("TOURS_PROVIDER_ALLOWLIST", subject)
	if (!raw) return new Set()
	return new Set(
		raw
			.split(/[,;\s]+/)
			.map((part) => part.trim())
			.filter(Boolean)
	)
}

/** 0–100 inclusive. */
export function getTourRolloutPercent(subject?: TourCanarySubject): number {
	const raw = readEnv("TOURS_ROLLOUT_PERCENT", subject)
	if (!raw) return 0
	const parsed = Number(raw)
	if (!Number.isFinite(parsed)) return 0
	return Math.min(100, Math.max(0, parsed))
}

function stagingHosts(subject?: TourCanarySubject): Set<string> {
	const raw = readEnv("TOURS_ROLLOUT_STAGING_HOSTS", subject)
	const hosts = new Set(
		raw
			.split(/[,;\s]+/)
			.map((part) => part.trim().toLowerCase())
			.filter(Boolean)
	)
	// Sensible defaults when unset.
	if (hosts.size === 0) {
		hosts.add("localhost")
		hosts.add("127.0.0.1")
	}
	return hosts
}

export function isTourStagingDeployment(subject?: TourCanarySubject): boolean {
	const deployment = String(
		subject?.deploymentEnv ||
			readEnv("TOURS_ROLLOUT_DEPLOYMENT_ENV", subject) ||
			readEnv("VERCEL_ENV", subject) ||
			readEnv("NODE_ENV", subject) ||
			""
	)
		.trim()
		.toLowerCase()
	if (deployment === "preview" || deployment === "staging" || deployment === "development") {
		return true
	}
	const host = String(subject?.host ?? "")
		.trim()
		.toLowerCase()
	if (host && stagingHosts(subject).has(host)) return true
	return false
}

/** Stable 0–99 bucket from subject id (FNV-1a 32-bit). */
export function tourCanaryBucket(subjectKey: string): number {
	let hash = 0x811c9dc5
	const input = String(subjectKey)
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0) % 100
}

function subjectKey(subject?: TourCanarySubject): string | null {
	const providerId = String(subject?.providerId ?? "").trim()
	if (providerId) return `provider:${providerId}`
	const subjectId = String(subject?.subjectId ?? "").trim()
	if (subjectId) return `subject:${subjectId}`
	return null
}

export function evaluateTourCanary(input: {
	killSwitchEnabled: boolean
	subject?: TourCanarySubject
}): TourCanaryDecision {
	const stage = getTourRolloutStage(input.subject)
	if (!input.killSwitchEnabled) {
		return { enabled: false, stage, reason: "kill_switch_off" }
	}
	if (stage === "off") {
		return { enabled: false, stage, reason: "stage_off" }
	}
	if (stage === "general") {
		return { enabled: true, stage, reason: "enabled" }
	}
	if (stage === "staging") {
		const ok = isTourStagingDeployment(input.subject)
		return {
			enabled: ok,
			stage,
			reason: ok ? "enabled" : "staging_mismatch",
		}
	}

	const allowlist = getTourProviderAllowlist(input.subject)
	const providerId = String(input.subject?.providerId ?? "").trim()
	const onAllowlist = Boolean(providerId && allowlist.has(providerId))

	if (stage === "allowlist") {
		if (!providerId) {
			return { enabled: false, stage, reason: "missing_subject" }
		}
		return {
			enabled: onAllowlist,
			stage,
			reason: onAllowlist ? "enabled" : "not_allowlisted",
		}
	}

	// percentage
	if (onAllowlist) {
		return { enabled: true, stage, reason: "enabled" }
	}
	const key = subjectKey(input.subject)
	if (!key) {
		return { enabled: false, stage, reason: "missing_subject" }
	}
	const percent = getTourRolloutPercent(input.subject)
	const inBucket = tourCanaryBucket(key) < percent
	return {
		enabled: inBucket,
		stage,
		reason: inBucket ? "enabled" : "outside_percentage",
	}
}

export function toFeatureFlagContext(subject?: TourCanarySubject): FeatureFlagContext | undefined {
	if (!subject?.env) return undefined
	return { env: subject.env }
}
