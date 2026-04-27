import { logger } from "@/lib/observability/logger"
import { recordMigrationMetric, recordPolicyContractPathUsage } from "@/lib/observability/metrics"

export type MigrationEventType =
	| "SEARCH_COMPARISON"
	| "SEARCH_COMPARISON_DETAILED"
	| "POLICY_CONTRACT_MISMATCH"
	| "POLICY_CONTRACT_PATH_USED"
	| "FALLBACK_TRIGGERED"
	| "FEATURE_FLAG_EVALUATION"

type BaseEvent = {
	requestId: string
	domain: string
	endpoint: string
	durationMs?: number
}

export type SearchComparisonEvent = BaseEvent & {
	event: "SEARCH_COMPARISON"
	mismatch: boolean
	differences: {
		sellableMismatch: boolean
		reasonCodeMismatch: boolean
		priceMismatch: boolean
	}
	baselineSummary: Record<string, unknown>
	candidateSummary: Record<string, unknown>
	reason?: string | null
}

export type SearchComparisonDetailedEvent = BaseEvent & {
	event: "SEARCH_COMPARISON_DETAILED"
	mismatchType: "critical" | "major" | "minor"
	hotelId: string
	ratePlanId: string
	dateRange: string
	occupancy: {
		adults: number
		children: number
	}
	lengthOfStay: number
	baseline: {
		isSellable: boolean
		reasonCodes: string[]
		priceDisplay: { amount: number | null; currency: string | null }
	}
	candidate: {
		isSellable: boolean
		reasonCodes: string[]
		priceDisplay: { amount: number | null; currency: string | null }
	}
}

export type PolicyContractMismatchEvent = BaseEvent & {
	event: "POLICY_CONTRACT_MISMATCH"
	productId?: string | null
	variantId?: string | null
	ratePlanId?: string | null
	missingCategories: string[]
}

export type PolicyContractPathUsedEvent = BaseEvent & {
	event: "POLICY_CONTRACT_PATH_USED"
	contract: "v2" | "legacy"
	ratePlanId?: string | null
}

export type FallbackTriggeredEvent = BaseEvent & {
	event: "FALLBACK_TRIGGERED"
	reason: string
	path?: string
}

export type FeatureFlagEvaluationEvent = BaseEvent & {
	event: "FEATURE_FLAG_EVALUATION"
	flags: Record<string, boolean>
	overrides?: Record<string, string | null>
}

export type MigrationEvent =
	| SearchComparisonEvent
	| SearchComparisonDetailedEvent
	| PolicyContractMismatchEvent
	| PolicyContractPathUsedEvent
	| FallbackTriggeredEvent
	| FeatureFlagEvaluationEvent

export function logMigrationEvent(payload: MigrationEvent): void {
	const { domain, endpoint, durationMs } = payload
	if (payload.event === "SEARCH_COMPARISON") {
		recordMigrationMetric({
			domain,
			endpoint,
			outcome: payload.mismatch ? "mismatch" : "ok",
			durationMs,
		})
	}
	if (payload.event === "FALLBACK_TRIGGERED") {
		recordMigrationMetric({
			domain,
			endpoint,
			outcome: "fallback",
			durationMs,
		})
	}
	if (payload.event === "POLICY_CONTRACT_MISMATCH") {
		recordMigrationMetric({
			domain,
			endpoint,
			outcome: "mismatch",
			durationMs,
		})
	}
	if (payload.event === "POLICY_CONTRACT_PATH_USED") {
		recordMigrationMetric({
			domain,
			endpoint,
			outcome: "ok",
			durationMs,
		})
		recordPolicyContractPathUsage({
			endpoint,
			contract: payload.contract,
		})
	}
	if (payload.event === "FEATURE_FLAG_EVALUATION") {
		recordMigrationMetric({
			domain,
			endpoint,
			outcome: "ok",
			durationMs,
		})
	}
	logger.info(payload.event, payload as Record<string, unknown>)
}

export function logFeatureFlagEvaluation(event: Omit<FeatureFlagEvaluationEvent, "event">): void {
	logMigrationEvent({
		event: "FEATURE_FLAG_EVALUATION",
		...event,
	})
}

export function logSearchComparison(event: Omit<SearchComparisonEvent, "event">): void {
	logMigrationEvent({
		event: "SEARCH_COMPARISON",
		...event,
	})
}

export function logSearchComparisonDetailed(
	event: Omit<SearchComparisonDetailedEvent, "event">
): void {
	logMigrationEvent({
		event: "SEARCH_COMPARISON_DETAILED",
		...event,
	})
}

export function logPolicyContractMismatch(event: Omit<PolicyContractMismatchEvent, "event">): void {
	logMigrationEvent({
		event: "POLICY_CONTRACT_MISMATCH",
		...event,
	})
}

export function logPolicyContractPathUsed(event: Omit<PolicyContractPathUsedEvent, "event">): void {
	logMigrationEvent({
		event: "POLICY_CONTRACT_PATH_USED",
		...event,
	})
}

export function logFallbackTriggered(event: Omit<FallbackTriggeredEvent, "event">): void {
	logMigrationEvent({
		event: "FALLBACK_TRIGGERED",
		...event,
	})
}
