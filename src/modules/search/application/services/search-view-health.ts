import {
	SEARCH_VIEW_REASON_CODES,
	SEARCH_VIEW_SLA,
	evaluateSearchViewState,
	type SearchViewReasonCode,
} from "../use-cases/search-view-governance"

export type SearchViewGovernanceSnapshot = {
	totalExpectedRows: number
	presentRows: number
	blockerGapRows: number
	lastMaterializedAt?: string | Date | null
	now?: Date
}

export type SearchViewGovernanceHealth = {
	isFresh: boolean
	coverageRatio: number
	reasonCodes: SearchViewReasonCode[]
	lastMaterializedAt: string | null
	totalExpectedRows: number
	presentRows: number
	coveredRows: number
	gapRows: number
	missingRows: number
	blockerGapRows: number
	gapsDetected: boolean
	sla: {
		maxLagMinutes: number
		minCoverageThreshold: number
	}
}

function clampToInt(value: number): number {
	return Math.max(0, Math.floor(Number(value || 0)))
}

function dedupeReasonCodes(codes: readonly string[]): SearchViewReasonCode[] {
	const allowed = new Set<string>(Object.values(SEARCH_VIEW_REASON_CODES))
	return [...new Set(codes.filter((code) => allowed.has(code)))] as SearchViewReasonCode[]
}

export function buildSearchViewGovernanceHealth(
	input: SearchViewGovernanceSnapshot
): SearchViewGovernanceHealth {
	const totalExpectedRows = clampToInt(input.totalExpectedRows)
	const presentRows = Math.min(totalExpectedRows, clampToInt(input.presentRows))
	const blockerGapRows = Math.min(presentRows, clampToInt(input.blockerGapRows))
	const missingRows = Math.max(0, totalExpectedRows - presentRows)
	const gapRows = Math.max(0, missingRows + blockerGapRows)
	const coveredRows = Math.max(0, totalExpectedRows - gapRows)

	const state = evaluateSearchViewState({
		totalExpectedRows,
		coveredRows,
		lastMaterializedAt: input.lastMaterializedAt ?? null,
		now: input.now,
		maxLagMinutes: SEARCH_VIEW_SLA.maxLagMinutes,
		minCoverageThreshold: SEARCH_VIEW_SLA.minCoverageThreshold,
	})

	return {
		isFresh: state.isFresh,
		coverageRatio: state.coverageRatio,
		reasonCodes: dedupeReasonCodes(state.reasonCodes),
		lastMaterializedAt: state.lastMaterializedAt,
		totalExpectedRows,
		presentRows,
		coveredRows,
		gapRows,
		missingRows,
		blockerGapRows,
		gapsDetected: gapRows > 0,
		sla: {
			maxLagMinutes: SEARCH_VIEW_SLA.maxLagMinutes,
			minCoverageThreshold: SEARCH_VIEW_SLA.minCoverageThreshold,
		},
	}
}
