export type MaterializationFreshnessState = "fresh" | "delayed" | "stale" | "missing"

export type MaterializationFreshness = {
	label: string
	state: MaterializationFreshnessState
	lastMaterializedAt: string | null
	ageMinutes: number | null
	coveragePercent: number
	coveredRows: number
	expectedRows: number
	missingRows: number
	summary: string
}

export type MaterializationReadinessStatus = "ready" | "attention" | "blocked"

export type MaterializationReadinessIssue = {
	code:
		| "missing_rows"
		| "missing_materialization"
		| "stale_materialization"
		| "delayed_materialization"
	severity: "warning" | "critical"
	label: string
	message: string
	missingRows: number
	coveragePercent: number
	ageMinutes: number | null
}

export type MaterializationReadiness = {
	status: MaterializationReadinessStatus
	statusLabel: string
	score: number
	summary: string
	totalExpectedRows: number
	totalCoveredRows: number
	totalMissingRows: number
	coveragePercent: number
	issues: MaterializationReadinessIssue[]
}

export type MaterializationFreshnessInput = {
	label: string
	expectedRows: number
	timestamps: Array<Date | string | null | undefined>
	now?: Date
	delayedAfterMinutes?: number
	staleAfterMinutes?: number
}

const DEFAULT_DELAYED_AFTER_MINUTES = 30
const DEFAULT_STALE_AFTER_MINUTES = 180

export function evaluateMaterializationFreshness(
	input: MaterializationFreshnessInput
): MaterializationFreshness {
	const expectedRows = Math.max(0, Number(input.expectedRows ?? 0))
	const now = input.now ?? new Date()
	const timestamps = input.timestamps
		.map(toDate)
		.filter((date): date is Date => date != null && !Number.isNaN(date.getTime()))
	const coveredRows = Math.min(expectedRows, timestamps.length)
	const missingRows = Math.max(0, expectedRows - coveredRows)
	const coveragePercent =
		expectedRows > 0 ? Math.round((coveredRows / expectedRows) * 100) : coveredRows > 0 ? 100 : 0
	const newestTimestamp = timestamps
		.slice()
		.sort((a, b) => b.getTime() - a.getTime())
		.at(0)
	const ageMinutes = newestTimestamp
		? Math.max(0, Math.floor((now.getTime() - newestTimestamp.getTime()) / 60000))
		: null
	const delayedAfterMinutes = Math.max(
		1,
		Number(input.delayedAfterMinutes ?? DEFAULT_DELAYED_AFTER_MINUTES)
	)
	const staleAfterMinutes = Math.max(
		delayedAfterMinutes,
		Number(input.staleAfterMinutes ?? DEFAULT_STALE_AFTER_MINUTES)
	)
	const state: MaterializationFreshnessState =
		expectedRows > 0 && coveredRows === 0
			? "missing"
			: missingRows > 0
				? "delayed"
				: ageMinutes == null
					? "missing"
					: ageMinutes >= staleAfterMinutes
						? "stale"
						: ageMinutes >= delayedAfterMinutes
							? "delayed"
							: "fresh"

	return {
		label: input.label,
		state,
		lastMaterializedAt: newestTimestamp ? newestTimestamp.toISOString() : null,
		ageMinutes,
		coveragePercent,
		coveredRows,
		expectedRows,
		missingRows,
		summary: buildFreshnessSummary({
			state,
			ageMinutes,
			missingRows,
			coveragePercent,
		}),
	}
}

export function summarizeMaterializationFreshness(
	items: MaterializationFreshness[]
): MaterializationFreshness {
	const order: MaterializationFreshnessState[] = ["fresh", "delayed", "stale", "missing"]
	const worst = items
		.slice()
		.sort((a, b) => order.indexOf(b.state) - order.indexOf(a.state))
		.at(0)
	const lastMaterializedAt = items
		.map((item) => toDate(item.lastMaterializedAt))
		.filter((date): date is Date => date != null)
		.sort((a, b) => b.getTime() - a.getTime())
		.at(0)
	const expectedRows = items.reduce((sum, item) => sum + item.expectedRows, 0)
	const coveredRows = items.reduce((sum, item) => sum + item.coveredRows, 0)
	const missingRows = items.reduce((sum, item) => sum + item.missingRows, 0)
	const coveragePercent =
		expectedRows > 0 ? Math.round((coveredRows / expectedRows) * 100) : coveredRows > 0 ? 100 : 0
	const ageMinutes = lastMaterializedAt
		? Math.max(0, Math.floor((Date.now() - lastMaterializedAt.getTime()) / 60000))
		: null
	const state = worst?.state ?? "missing"
	return {
		label: "Health",
		state,
		lastMaterializedAt: lastMaterializedAt ? lastMaterializedAt.toISOString() : null,
		ageMinutes,
		coveragePercent,
		coveredRows,
		expectedRows,
		missingRows,
		summary: buildFreshnessSummary({ state, ageMinutes, missingRows, coveragePercent }),
	}
}

export function evaluateMaterializationReadiness(
	items: MaterializationFreshness[]
): MaterializationReadiness {
	const totalExpectedRows = items.reduce((sum, item) => sum + item.expectedRows, 0)
	const totalCoveredRows = items.reduce((sum, item) => sum + item.coveredRows, 0)
	const totalMissingRows = items.reduce((sum, item) => sum + item.missingRows, 0)
	const coveragePercent =
		totalExpectedRows > 0
			? Math.round((totalCoveredRows / totalExpectedRows) * 100)
			: totalCoveredRows > 0
				? 100
				: 0
	const issues = items.flatMap(readinessIssuesFor)
	const hasCritical = issues.some((issue) => issue.severity === "critical")
	const hasWarning = issues.some((issue) => issue.severity === "warning")
	const status: MaterializationReadinessStatus = hasCritical
		? "blocked"
		: hasWarning
			? "attention"
			: "ready"
	const score = Math.max(
		0,
		Math.min(
			100,
			Math.round(
				coveragePercent -
					issues.reduce((penalty, issue) => penalty + (issue.severity === "critical" ? 20 : 8), 0)
			)
		)
	)
	return {
		status,
		statusLabel: readinessStatusLabel(status),
		score,
		summary: readinessSummary({ status, issues, coveragePercent, totalMissingRows }),
		totalExpectedRows,
		totalCoveredRows,
		totalMissingRows,
		coveragePercent,
		issues,
	}
}

export function formatFreshnessAge(ageMinutes: number | null): string {
	if (ageMinutes == null) return "sin materializar"
	if (ageMinutes < 1) return "ahora"
	if (ageMinutes < 60) return `hace ${ageMinutes} min`
	const hours = Math.floor(ageMinutes / 60)
	if (hours < 24) return `hace ${hours} h`
	return `hace ${Math.floor(hours / 24)} d`
}

function buildFreshnessSummary(params: {
	state: MaterializationFreshnessState
	ageMinutes: number | null
	missingRows: number
	coveragePercent: number
}): string {
	if (params.state === "missing") return "Sin materializacion visible"
	if (params.missingRows > 0) {
		return `${params.coveragePercent}% materializado · ${params.missingRows} filas faltantes`
	}
	return `Actualizado ${formatFreshnessAge(params.ageMinutes)}`
}

function readinessIssuesFor(item: MaterializationFreshness): MaterializationReadinessIssue[] {
	const issues: MaterializationReadinessIssue[] = []
	if (item.state === "missing") {
		issues.push({
			code: "missing_materialization",
			severity: "critical",
			label: item.label,
			message: `${item.label}: sin materializacion visible para el rango seleccionado.`,
			missingRows: item.missingRows,
			coveragePercent: item.coveragePercent,
			ageMinutes: item.ageMinutes,
		})
		return issues
	}
	if (item.state === "stale") {
		issues.push({
			code: "stale_materialization",
			severity: "critical",
			label: item.label,
			message: `${item.label}: materializacion desactualizada (${formatFreshnessAge(item.ageMinutes)}).`,
			missingRows: item.missingRows,
			coveragePercent: item.coveragePercent,
			ageMinutes: item.ageMinutes,
		})
	}
	if (item.missingRows > 0) {
		issues.push({
			code: "missing_rows",
			severity: "warning",
			label: item.label,
			message: `${item.label}: ${item.missingRows} filas faltantes en el rango seleccionado.`,
			missingRows: item.missingRows,
			coveragePercent: item.coveragePercent,
			ageMinutes: item.ageMinutes,
		})
	}
	if (item.state === "delayed" && item.missingRows === 0) {
		issues.push({
			code: "delayed_materialization",
			severity: "warning",
			label: item.label,
			message: `${item.label}: actualizacion con retraso (${formatFreshnessAge(item.ageMinutes)}).`,
			missingRows: item.missingRows,
			coveragePercent: item.coveragePercent,
			ageMinutes: item.ageMinutes,
		})
	}
	return issues
}

function readinessStatusLabel(status: MaterializationReadinessStatus): string {
	if (status === "ready") return "Listo"
	if (status === "attention") return "Revisar"
	return "Bloqueado"
}

function readinessSummary(params: {
	status: MaterializationReadinessStatus
	issues: MaterializationReadinessIssue[]
	coveragePercent: number
	totalMissingRows: number
}): string {
	if (params.status === "ready") return "Materializaciones listas para operar."
	if (params.totalMissingRows > 0) {
		return `${params.coveragePercent}% de cobertura · ${params.totalMissingRows} filas faltantes.`
	}
	const critical = params.issues.filter((issue) => issue.severity === "critical").length
	if (critical > 0) return `${critical} materializaciones criticas requieren revision.`
	return `${params.issues.length} materializaciones requieren revision.`
}

function toDate(value: Date | string | null | undefined): Date | null {
	if (value == null) return null
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
	const parsed = new Date(value)
	return Number.isNaN(parsed.getTime()) ? null : parsed
}
