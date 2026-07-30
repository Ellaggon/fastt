import { logger } from "@/lib/observability/logger"
import { and, db, desc, eq, ProviderAuditLog } from "@/shared/infrastructure/db/compat"

export const INTEGRATION_UX_EVENTS = {
	journeyStarted: "provider.integrations.ux.journey_started",
	connectorSelected: "provider.integrations.ux.connector_selected",
	stepViewed: "provider.integrations.ux.step_viewed",
	stepCompleted: "provider.integrations.ux.step_completed",
	authorizationError: "provider.integrations.ux.authorization_error",
	mappingSnapshot: "provider.integrations.ux.mapping_snapshot",
	firstSyncValid: "provider.integrations.ux.first_sync_valid",
} as const

export type IntegrationUxEventName =
	(typeof INTEGRATION_UX_EVENTS)[keyof typeof INTEGRATION_UX_EVENTS]

const ENTITY_TYPE = "IntegrationUxFunnel"
const EVENT_ALLOWLIST = new Set<string>(Object.values(INTEGRATION_UX_EVENTS))
const CONNECTOR_ALLOWLIST = new Set(["channel_manager", "external_calendars"])
const STEP_ALLOWLIST = new Set(["catalog", "provider", "access", "property", "review", "mapping"])

function cleanString(value: unknown, max = 100): string | null {
	const normalized = String(value ?? "").trim()
	return normalized ? normalized.slice(0, max) : null
}

function boundedInteger(value: unknown, max: number): number | null {
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) return null
	return Math.max(0, Math.min(max, Math.round(parsed)))
}

export function isIntegrationUxEventName(value: unknown): value is IntegrationUxEventName {
	return EVENT_ALLOWLIST.has(String(value ?? "").trim())
}

export type IntegrationUxEventInput = {
	event: IntegrationUxEventName
	providerId: string
	actorUserId?: string | null
	journeyId?: string | null
	connectorKey?: string | null
	step?: string | null
	durationMs?: number | null
	pendingMappings?: number | null
	totalMappings?: number | null
	errorCode?: string | null
	surface?: string | null
}

function normalizePayload(input: IntegrationUxEventInput) {
	const providerId = cleanString(input.providerId, 80)
	const journeyId = cleanString(input.journeyId, 80)
	if (!providerId || !journeyId || !isIntegrationUxEventName(input.event)) return null
	const connectorRaw = cleanString(input.connectorKey, 40)
	const stepRaw = cleanString(input.step, 40)
	const errorRaw = cleanString(input.errorCode, 80)
	return {
		providerId,
		actorUserId: cleanString(input.actorUserId, 80),
		journeyId,
		connectorKey: connectorRaw && CONNECTOR_ALLOWLIST.has(connectorRaw) ? connectorRaw : null,
		step: stepRaw && STEP_ALLOWLIST.has(stepRaw) ? stepRaw : null,
		durationMs: boundedInteger(input.durationMs, 86_400_000),
		pendingMappings: boundedInteger(input.pendingMappings, 100_000),
		totalMappings: boundedInteger(input.totalMappings, 100_000),
		errorCode: errorRaw ? errorRaw.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_") : null,
		surface: cleanString(input.surface, 40) ?? "integrations",
	}
}

export async function recordProviderIntegrationUxEvent(
	input: IntegrationUxEventInput
): Promise<{ ok: boolean; error?: string }> {
	const payload = normalizePayload(input)
	if (!payload) return { ok: false, error: "invalid_payload" }

	await db.insert(ProviderAuditLog).values({
		id: crypto.randomUUID(),
		providerId: payload.providerId,
		actorUserId: payload.actorUserId ?? undefined,
		action: input.event,
		entityType: ENTITY_TYPE,
		entityId: payload.journeyId,
		beforeJson: null,
		afterJson: payload,
		riskLevel: "low",
		createdAt: new Date(),
	})
	logger.info(input.event, {
		providerId: payload.providerId,
		journeyId: payload.journeyId,
		step: payload.step,
		connectorKey: payload.connectorKey,
	})
	return { ok: true }
}

function percentile(values: number[], ratio: number): number | null {
	if (!values.length) return null
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

function percent(numerator: number, denominator: number): number | null {
	return denominator ? Math.round((numerator / denominator) * 1000) / 10 : null
}

export async function summarizeProviderIntegrationUx(params?: {
	providerId?: string | null
	limit?: number
	maturityMinutes?: number
}) {
	const providerId = cleanString(params?.providerId, 80)
	const limit = Math.min(10_000, Math.max(100, Number(params?.limit) || 5_000))
	const maturityMs = Math.max(5, Number(params?.maturityMinutes) || 30) * 60_000
	const rows = await db
		.select({
			action: ProviderAuditLog.action,
			afterJson: ProviderAuditLog.afterJson,
			createdAt: ProviderAuditLog.createdAt,
		})
		.from(ProviderAuditLog)
		.where(
			providerId
				? and(
						eq(ProviderAuditLog.entityType, ENTITY_TYPE),
						eq(ProviderAuditLog.providerId, providerId)
					)
				: eq(ProviderAuditLog.entityType, ENTITY_TYPE)
		)
		.orderBy(desc(ProviderAuditLog.createdAt))
		.limit(limit)

	const events = rows.map((row) => {
		const payload =
			row.afterJson && typeof row.afterJson === "object" && !Array.isArray(row.afterJson)
				? (row.afterJson as Record<string, unknown>)
				: {}
		return {
			action: String(row.action),
			journeyId: cleanString(payload.journeyId, 80),
			step: cleanString(payload.step, 40),
			durationMs: boundedInteger(payload.durationMs, 86_400_000),
			pendingMappings: boundedInteger(payload.pendingMappings, 100_000),
			totalMappings: boundedInteger(payload.totalMappings, 100_000),
			createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
		}
	})
	const journeys = new Map<string, typeof events>()
	for (const event of events) {
		if (!event.journeyId) continue
		const journey = journeys.get(event.journeyId) ?? []
		journey.push(event)
		journeys.set(event.journeyId, journey)
	}

	const selectionDurations = events
		.filter((event) => event.action === INTEGRATION_UX_EVENTS.connectorSelected)
		.flatMap((event) => (event.durationMs == null ? [] : [event.durationMs]))
	const syncDurations = events
		.filter((event) => event.action === INTEGRATION_UX_EVENTS.firstSyncValid)
		.flatMap((event) => (event.durationMs == null ? [] : [event.durationMs]))
	const startedJourneys = new Set(
		events
			.filter((event) => event.action === INTEGRATION_UX_EVENTS.journeyStarted)
			.map((event) => event.journeyId)
			.filter(Boolean)
	)
	const syncedJourneys = new Set(
		events
			.filter((event) => event.action === INTEGRATION_UX_EVENTS.firstSyncValid)
			.map((event) => event.journeyId)
			.filter(Boolean)
	)
	const now = Date.now()
	const steps = ["provider", "access", "property", "review", "mapping"].map((step) => {
		const viewed = new Set(
			events
				.filter((event) => event.action === INTEGRATION_UX_EVENTS.stepViewed && event.step === step)
				.map((event) => event.journeyId)
				.filter(Boolean)
		)
		const completed = new Set(
			events
				.filter(
					(event) => event.action === INTEGRATION_UX_EVENTS.stepCompleted && event.step === step
				)
				.map((event) => event.journeyId)
				.filter(Boolean)
		)
		const matureViewed = [...viewed].filter((journeyId) => {
			const journey = journeys.get(journeyId ?? "")
			const latest = journey?.reduce((max, event) => Math.max(max, event.createdAt.getTime()), 0)
			return latest != null && now - latest >= maturityMs
		})
		const abandoned = matureViewed.filter((journeyId) => !completed.has(journeyId)).length
		return {
			step,
			viewed: viewed.size,
			completed: completed.size,
			matureViewed: matureViewed.length,
			abandoned,
			abandonmentRatePercent: percent(abandoned, matureViewed.length),
		}
	})
	const mappingSnapshots = events.filter(
		(event) => event.action === INTEGRATION_UX_EVENTS.mappingSnapshot
	)
	const pendingMappings = mappingSnapshots.flatMap((event) =>
		event.pendingMappings == null ? [] : [event.pendingMappings]
	)
	const authorizationErrors = events.filter(
		(event) => event.action === INTEGRATION_UX_EVENTS.authorizationError
	).length

	return {
		journeysStarted: startedJourneys.size,
		connectorSelections: selectionDurations.length,
		timeToChoose: {
			medianMs: percentile(selectionDurations, 0.5),
			p75Ms: percentile(selectionDurations, 0.75),
		},
		steps,
		authorizationErrors,
		authorizationErrorRatePercent: percent(
			authorizationErrors,
			steps.find((step) => step.step === "access")?.viewed ?? 0
		),
		mappings: {
			snapshots: mappingSnapshots.length,
			latestPending: mappingSnapshots[0]?.pendingMappings ?? null,
			medianPending: percentile(pendingMappings, 0.5),
			fullyMappedRatePercent: percent(
				mappingSnapshots.filter((event) => event.pendingMappings === 0).length,
				mappingSnapshots.length
			),
		},
		firstValidSync: {
			completedJourneys: syncedJourneys.size,
			ratePercent: percent(syncedJourneys.size, startedJourneys.size),
			medianMs: percentile(syncDurations, 0.5),
			p75Ms: percentile(syncDurations, 0.75),
		},
		sampleEvents: events.length,
		maturityMinutes: maturityMs / 60_000,
	}
}
