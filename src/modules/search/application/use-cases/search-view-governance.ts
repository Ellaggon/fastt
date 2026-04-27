export const SEARCH_VIEW_SLA = {
	maxLagMinutes: 30,
	minCoverageThreshold: 0.995,
} as const

export const SEARCH_VIEW_REASON_CODES = {
	STALE_VIEW: "STALE_VIEW",
	MISSING_COVERAGE: "MISSING_COVERAGE",
	PARTIAL_COVERAGE: "PARTIAL_COVERAGE",
	FRESH_VIEW: "FRESH_VIEW",
} as const

export type SearchViewReasonCode =
	(typeof SEARCH_VIEW_REASON_CODES)[keyof typeof SEARCH_VIEW_REASON_CODES]

export type SearchViewStateEvaluation = {
	isFresh: boolean
	coverageRatio: number
	reasonCodes: SearchViewReasonCode[]
	lastMaterializedAt: string | null
}

export type EvaluateSearchViewStateInput = {
	totalExpectedRows: number
	coveredRows: number
	lastMaterializedAt?: Date | string | null
	now?: Date
	maxLagMinutes?: number
	minCoverageThreshold?: number
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

function toDate(value: Date | string | null | undefined): Date | null {
	if (value == null) return null
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value
	}
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function evaluateSearchViewState(
	input: EvaluateSearchViewStateInput
): SearchViewStateEvaluation {
	const expected = Math.max(0, Number(input.totalExpectedRows ?? 0))
	const covered = Math.max(0, Number(input.coveredRows ?? 0))
	const normalizedCovered = Math.min(expected, covered)
	const coverageRatio = expected <= 0 ? 1 : clamp(normalizedCovered / Math.max(1, expected), 0, 1)
	const minCoverageThreshold = clamp(
		Number(input.minCoverageThreshold ?? SEARCH_VIEW_SLA.minCoverageThreshold),
		0,
		1
	)
	const hasCoverage = coverageRatio >= minCoverageThreshold

	const maxLagMinutes = Math.max(1, Number(input.maxLagMinutes ?? SEARCH_VIEW_SLA.maxLagMinutes))
	const now = input.now instanceof Date ? input.now : new Date()
	const lastMaterializedAtDate = toDate(input.lastMaterializedAt)
	const ageMinutes =
		lastMaterializedAtDate == null
			? Number.POSITIVE_INFINITY
			: Math.max(0, (now.getTime() - lastMaterializedAtDate.getTime()) / 60_000)
	const isFresh = lastMaterializedAtDate != null && ageMinutes <= maxLagMinutes

	const reasonCodes: SearchViewReasonCode[] = []
	if (isFresh && hasCoverage) {
		reasonCodes.push(SEARCH_VIEW_REASON_CODES.FRESH_VIEW)
	} else {
		if (!isFresh) reasonCodes.push(SEARCH_VIEW_REASON_CODES.STALE_VIEW)
		if (coverageRatio <= 0) {
			reasonCodes.push(SEARCH_VIEW_REASON_CODES.MISSING_COVERAGE)
		} else if (!hasCoverage) {
			reasonCodes.push(SEARCH_VIEW_REASON_CODES.PARTIAL_COVERAGE)
		}
	}

	return {
		isFresh,
		coverageRatio,
		reasonCodes,
		lastMaterializedAt:
			lastMaterializedAtDate == null ? null : lastMaterializedAtDate.toISOString(),
	}
}
