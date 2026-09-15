export type ProviderOnboardingRolloutStage =
	| "off"
	| "staging"
	| "allowlist"
	| "percentage"
	| "general"

export type ProviderOnboardingRollout = {
	enabled: boolean
	stage: ProviderOnboardingRolloutStage
	cohort: "canary" | "control" | "unknown"
	reason: string
}

const VALID_STAGES = new Set<ProviderOnboardingRolloutStage>([
	"off",
	"staging",
	"allowlist",
	"percentage",
	"general",
])

function bool(value: unknown, fallback: boolean): boolean {
	if (value == null) return fallback
	return ["1", "true", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase())
}

function stage(value: unknown): ProviderOnboardingRolloutStage {
	const normalized = String(value ?? "off")
		.trim()
		.toLowerCase()
	return VALID_STAGES.has(normalized as ProviderOnboardingRolloutStage)
		? (normalized as ProviderOnboardingRolloutStage)
		: "off"
}

function list(value: unknown): Set<string> {
	return new Set(
		String(value ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
	)
}

/** Stable, non-secret bucket. It is only for rollout assignment, never authorization. */
export function providerOnboardingRolloutBucket(subjectId: string): number {
	let hash = 2166136261
	for (const char of String(subjectId)) {
		hash ^= char.charCodeAt(0)
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0) % 100
}

/**
 * Server-side cohort gate for the new provider onboarding. It deliberately
 * accepts environment only; query strings, headers and cookies cannot enable it.
 */
export function resolveProviderOnboardingRollout(input: {
	userId?: string | null
	host?: string | null
	env?: Record<string, string | undefined>
}): ProviderOnboardingRollout {
	const env = input.env ?? process.env
	if (!bool(env.PROVIDER_ONBOARDING_ENABLED, true)) {
		return { enabled: false, stage: "off", cohort: "control", reason: "kill_switch" }
	}

	const currentStage = stage(env.PROVIDER_ONBOARDING_ROLLOUT_STAGE)
	const userId = String(input.userId ?? "").trim()
	if (currentStage === "off") {
		return { enabled: false, stage: currentStage, cohort: "control", reason: "stage_off" }
	}
	if (currentStage === "general") {
		return { enabled: true, stage: currentStage, cohort: "canary", reason: "general" }
	}
	if (!userId) {
		return { enabled: false, stage: currentStage, cohort: "unknown", reason: "no_subject" }
	}
	if (currentStage === "staging") {
		const host = String(input.host ?? "")
			.toLowerCase()
			.split(":")[0]
		const stagingHosts = list(env.PROVIDER_ONBOARDING_STAGING_HOSTS)
		const deployment = String(env.PROVIDER_ONBOARDING_DEPLOYMENT_ENV ?? "").toLowerCase()
		const allowed = deployment === "staging" || stagingHosts.has(host)
		return {
			enabled: allowed,
			stage: currentStage,
			cohort: allowed ? "canary" : "control",
			reason: allowed ? "staging" : "not_staging_host",
		}
	}

	const allowlist = list(env.PROVIDER_ONBOARDING_USER_ALLOWLIST)
	if (allowlist.has(userId)) {
		return { enabled: true, stage: currentStage, cohort: "canary", reason: "allowlist" }
	}
	if (currentStage === "allowlist") {
		return { enabled: false, stage: currentStage, cohort: "control", reason: "not_allowlisted" }
	}

	const percent = Math.max(0, Math.min(100, Number(env.PROVIDER_ONBOARDING_ROLLOUT_PERCENT) || 0))
	const enabled = providerOnboardingRolloutBucket(userId) < percent
	return {
		enabled,
		stage: currentStage,
		cohort: enabled ? "canary" : "control",
		reason: enabled ? "percentage" : "outside_percentage",
	}
}

export function providerOnboardingLegacyHref(): string {
	return "/provider/settings/profile?onboarding=legacy"
}
