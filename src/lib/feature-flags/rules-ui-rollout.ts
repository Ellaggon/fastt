import { createHash, randomUUID } from "node:crypto"
import { logger } from "@/lib/observability/logger"

type RolloutMode = "off" | "on" | "percentage"

export type RulesUiRolloutDecision = {
	enabled: boolean
	mode: RolloutMode
	percentage: number
	bucket: number | null
	rolloutId: string
	rolloutHash: string
}

export type RulesUiReadinessInput = {
	hasRuleSnapshot: boolean
	hasMapperError: boolean
	hasMismatch: boolean
}

export type RulesUiReadiness = {
	useRulesUi: boolean
	fallbackReason: "missing_rule_snapshot" | "mapper_error" | "mismatch_detected" | null
}

export const RULES_UI_ROLLOUT_COOKIE = "rules_ui_rollout_id"
let hasLoggedMissingRulesUiFlag = false

export function resolveRulesUiFlagValue(
	...candidates: Array<string | null | undefined>
): string | undefined {
	for (const candidate of candidates) {
		const value = String(candidate ?? "").trim()
		if (value.length > 0) return value
	}
	return undefined
}

function hashHex(value: string): string {
	return createHash("sha256").update(value).digest("hex")
}

function toBucket(value: string): number {
	const hash = hashHex(value)
	const num = Number.parseInt(hash.slice(0, 8), 16)
	return num % 100
}

function parseMode(raw: string | null | undefined): { mode: RolloutMode; percentage: number } {
	const value = String(raw ?? "")
		.trim()
		.toLowerCase()
	if (!value) return { mode: "off", percentage: 0 }
	if (["false", "off", "disabled", "no", "0"].includes(value)) {
		return { mode: "off", percentage: 0 }
	}
	if (["true", "on", "enabled", "yes", "1"].includes(value)) {
		return { mode: "on", percentage: 100 }
	}
	const isPercentSuffix = value.endsWith("%")
	const numericSource = isPercentSuffix ? value.slice(0, -1).trim() : value
	const numeric = Number(numericSource)
	if (!Number.isFinite(numeric)) return { mode: "off", percentage: 0 }
	const interpreted = !isPercentSuffix && numeric > 0 && numeric <= 1 ? numeric * 100 : numeric
	const percentage = Math.max(0, Math.min(100, Math.floor(interpreted)))
	if (percentage <= 0) return { mode: "off", percentage: 0 }
	if (percentage >= 100) return { mode: "on", percentage: 100 }
	return { mode: "percentage", percentage }
}

export function resolveRulesUiRollout(params: {
	flagValue: string | null | undefined
	rolloutId?: string | null
	createRolloutId?: () => string
}): RulesUiRolloutDecision {
	const rawFlagValue = String(params.flagValue ?? "").trim()
	const parsed = parseMode(params.flagValue)
	const provided = String(params.rolloutId ?? "").trim()
	const rolloutId = provided || (params.createRolloutId ? params.createRolloutId() : randomUUID())
	const rolloutHash = hashHex(rolloutId).slice(0, 16)

	if (!rawFlagValue && !hasLoggedMissingRulesUiFlag) {
		hasLoggedMissingRulesUiFlag = true
		logger.warn("rules.ui.rollout.flag_missing", {
			envKey: "RULES_UI_ENABLED",
			defaultMode: "off",
			defaultPercentage: 0,
		})
	}
	if (
		String(process.env.DEBUG_RULES_UI_ROLLOUT ?? "")
			.trim()
			.toLowerCase() === "true"
	) {
		logger.info("rules.ui.rollout.decision", {
			rawFlagValue: rawFlagValue || null,
			parsedMode: parsed.mode,
			parsedPercentage: parsed.percentage,
			rolloutHash,
			rolloutIdProvided: Boolean(provided),
		})
	}

	if (parsed.mode === "off") {
		return {
			enabled: false,
			mode: "off",
			percentage: 0,
			bucket: null,
			rolloutId,
			rolloutHash,
		}
	}
	if (parsed.mode === "on") {
		return {
			enabled: true,
			mode: "on",
			percentage: 100,
			bucket: 0,
			rolloutId,
			rolloutHash,
		}
	}
	const bucket = toBucket(rolloutId)
	return {
		enabled: bucket < parsed.percentage,
		mode: "percentage",
		percentage: parsed.percentage,
		bucket,
		rolloutId,
		rolloutHash,
	}
}

export function evaluateRulesUiReadiness(input: RulesUiReadinessInput): RulesUiReadiness {
	if (!input.hasRuleSnapshot) {
		return {
			useRulesUi: false,
			fallbackReason: "missing_rule_snapshot",
		}
	}
	if (input.hasMapperError) {
		return {
			useRulesUi: false,
			fallbackReason: "mapper_error",
		}
	}
	if (input.hasMismatch) {
		return {
			useRulesUi: false,
			fallbackReason: "mismatch_detected",
		}
	}
	return {
		useRulesUi: true,
		fallbackReason: null,
	}
}
