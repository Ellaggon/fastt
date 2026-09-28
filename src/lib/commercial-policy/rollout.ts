export type CommercialPolicyRolloutStage =
	| "off"
	| "staging"
	| "allowlist"
	| "percentage"
	| "general"

export type CommercialPolicyRollout = {
	enabled: boolean
	stage: CommercialPolicyRolloutStage
	cohort: "canary" | "control" | "unknown"
	reason: string
}

const stages = new Set<CommercialPolicyRolloutStage>([
	"off",
	"staging",
	"allowlist",
	"percentage",
	"general",
])

function enabled(value: unknown, fallback = false) {
	if (value == null) return fallback
	return ["1", "true", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase())
}

function configuredStage(value: unknown): CommercialPolicyRolloutStage {
	const candidate = String(value ?? "off")
		.trim()
		.toLowerCase()
	return stages.has(candidate as CommercialPolicyRolloutStage)
		? (candidate as CommercialPolicyRolloutStage)
		: "off"
}

function values(value: unknown) {
	return new Set(
		String(value ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean)
	)
}

/** Stable rollout bucket only; it is never used as an authorization decision by itself. */
export function commercialPolicyRolloutBucket(providerId: string): number {
	let hash = 2166136261
	for (const char of String(providerId)) {
		hash ^= char.charCodeAt(0)
		hash = Math.imul(hash, 16777619)
	}
	return (hash >>> 0) % 100
}

/**
 * Environment-only activation for the approved commercial-policy contract.
 * The global switch is a kill switch and the stage defaults to off, so merely
 * deploying this code never changes a legacy provider's authorization.
 */
export function resolveCommercialPolicyRollout(input: {
	providerId?: string | null
	host?: string | null
	env?: Record<string, string | undefined>
}): CommercialPolicyRollout {
	const env = input.env ?? process.env
	if (!enabled(env.FASTT_ENFORCE_COMMERCIAL_POLICY)) {
		return { enabled: false, stage: "off", cohort: "control", reason: "kill_switch" }
	}

	const stage = configuredStage(env.FASTT_COMMERCIAL_POLICY_ROLLOUT_STAGE)
	if (stage === "off") {
		return { enabled: false, stage, cohort: "control", reason: "stage_off" }
	}
	if (stage === "general") {
		return { enabled: true, stage, cohort: "canary", reason: "general" }
	}

	const providerId = String(input.providerId ?? "").trim()
	if (!providerId) return { enabled: false, stage, cohort: "unknown", reason: "no_provider" }
	if (stage === "staging") {
		const host = String(input.host ?? "")
			.toLowerCase()
			.split(":")[0]
		const stagingHosts = values(env.FASTT_COMMERCIAL_POLICY_STAGING_HOSTS)
		const deployment = String(env.FASTT_COMMERCIAL_POLICY_DEPLOYMENT_ENV ?? "").toLowerCase()
		const allowed = deployment === "staging" || stagingHosts.has(host)
		return {
			enabled: allowed,
			stage,
			cohort: allowed ? "canary" : "control",
			reason: allowed ? "staging" : "not_staging_host",
		}
	}

	const allowlist = values(env.FASTT_COMMERCIAL_POLICY_PROVIDER_ALLOWLIST)
	if (allowlist.has(providerId)) {
		return { enabled: true, stage, cohort: "canary", reason: "allowlist" }
	}
	if (stage === "allowlist") {
		return { enabled: false, stage, cohort: "control", reason: "not_allowlisted" }
	}

	const percentage = Math.max(
		0,
		Math.min(100, Number(env.FASTT_COMMERCIAL_POLICY_ROLLOUT_PERCENT) || 0)
	)
	const inCohort = commercialPolicyRolloutBucket(providerId) < percentage
	return {
		enabled: inCohort,
		stage,
		cohort: inCohort ? "canary" : "control",
		reason: inCohort ? "percentage" : "outside_percentage",
	}
}
