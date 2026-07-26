import { logger } from "@/lib/observability/logger"
import { and, db, desc, eq, ProviderAuditLog, sql } from "@/shared/infrastructure/db/compat"

export const SETTINGS_FUNNEL_EVENTS = {
	blockerShown: "provider.settings.funnel.blocker_shown",
	ctaClicked: "provider.settings.funnel.cta_clicked",
	domainComplete: "provider.settings.funnel.domain_complete",
	/** KYC capture timing (open→file / open→submit). duration in ctaTarget `ms=`. */
	kycCaptureTiming: "provider.settings.funnel.kyc_capture_timing",
} as const

export type SettingsFunnelEventName =
	(typeof SETTINGS_FUNNEL_EVENTS)[keyof typeof SETTINGS_FUNNEL_EVENTS]

export type SettingsFunnelDomain =
	| "identity"
	| "operations"
	| "verification"
	| "documents"
	| "fiscality"
	| "payments"
	| "integrations"
	| "team"

export type SettingsFunnelCtaKind = "primary" | "secondary" | "post_save"

export type SettingsFunnelSurface =
	| "hub_coach"
	| "profile"
	| "verification"
	| "fiscality"
	| "payments"
	| "integrations"
	| "team"
	| "unknown"

export type SettingsFunnelSink = "log" | "noop" | "db" | "both"

const EVENT_ALLOWLIST = new Set<string>(Object.values(SETTINGS_FUNNEL_EVENTS))

const DOMAIN_ALLOWLIST = new Set<string>([
	"identity",
	"operations",
	"verification",
	"documents",
	"fiscality",
	"payments",
	"integrations",
	"team",
])

const CTA_ALLOWLIST = new Set<string>(["primary", "secondary", "post_save"])

const FUNNEL_ENTITY_TYPE = "SettingsFunnel"

export function resolveSettingsFunnelSink(): SettingsFunnelSink {
	const raw = String(process.env.SETTINGS_FUNNEL_SINK ?? "log")
		.trim()
		.toLowerCase()
	if (raw === "noop" || raw === "off" || raw === "0") return "noop"
	if (raw === "db" || raw === "audit" || raw === "persist") return "db"
	if (raw === "both" || raw === "log+db" || raw === "db+log") return "both"
	return "log"
}

function cleanString(value: unknown, max = 120): string | null {
	const raw = String(value ?? "").trim()
	if (!raw) return null
	return raw.slice(0, max)
}

export function isSettingsFunnelEventName(value: unknown): value is SettingsFunnelEventName {
	return EVENT_ALLOWLIST.has(String(value ?? "").trim())
}

export function normalizeSettingsFunnelDomain(value: unknown): SettingsFunnelDomain | null {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase()
	if (!DOMAIN_ALLOWLIST.has(raw)) return null
	return raw as SettingsFunnelDomain
}

export type EmitProviderSettingsFunnelEventInput = {
	event: SettingsFunnelEventName
	providerId: string
	domain?: string | null
	blockerId?: string | null
	ctaKind?: string | null
	ctaTarget?: string | null
	surface?: string | null
	progressPercent?: number | null
	actorUserId?: string | null
}

export type SettingsFunnelPayload = {
	providerId: string
	domain: SettingsFunnelDomain | null
	blockerId: string | null
	ctaKind: SettingsFunnelCtaKind | null
	ctaTarget: string | null
	surface: string
	progressPercent: number | null
	actorUserId: string | null
}

function buildPayload(input: EmitProviderSettingsFunnelEventInput): SettingsFunnelPayload | null {
	if (!isSettingsFunnelEventName(input.event)) return null
	const providerId = cleanString(input.providerId, 80)
	if (!providerId) return null

	const domain = normalizeSettingsFunnelDomain(input.domain)
	const ctaKindRaw = cleanString(input.ctaKind, 40)
	const ctaKind =
		ctaKindRaw && CTA_ALLOWLIST.has(ctaKindRaw) ? (ctaKindRaw as SettingsFunnelCtaKind) : null

	return {
		providerId,
		domain,
		blockerId: cleanString(input.blockerId, 80),
		ctaKind,
		ctaTarget: cleanString(input.ctaTarget, 300),
		surface: cleanString(input.surface, 40) ?? "unknown",
		progressPercent:
			typeof input.progressPercent === "number" && Number.isFinite(input.progressPercent)
				? Math.max(0, Math.min(100, Math.round(input.progressPercent)))
				: null,
		actorUserId: cleanString(input.actorUserId, 80),
	}
}

async function persistFunnelEventToAudit(
	event: SettingsFunnelEventName,
	payload: SettingsFunnelPayload
): Promise<void> {
	await db.insert(ProviderAuditLog).values({
		id: crypto.randomUUID(),
		providerId: payload.providerId,
		actorUserId: payload.actorUserId ?? undefined,
		action: event,
		entityType: FUNNEL_ENTITY_TYPE,
		entityId: payload.domain ?? payload.blockerId ?? payload.surface,
		beforeJson: null,
		afterJson: payload,
		riskLevel: "low",
		createdAt: new Date(),
	})
}

/**
 * Structured funnel telemetry for provider settings.
 * Sinks: log (default), db (ProviderAuditLog queryable), both, noop.
 */
export function emitProviderSettingsFunnelEvent(input: EmitProviderSettingsFunnelEventInput): {
	ok: boolean
	skipped?: boolean
	error?: string
	sink?: SettingsFunnelSink
} {
	const payload = buildPayload(input)
	if (!payload) {
		if (!isSettingsFunnelEventName(input.event)) return { ok: false, error: "invalid_event" }
		return { ok: false, error: "provider_required" }
	}

	const sink = resolveSettingsFunnelSink()
	if (sink === "noop") {
		return { ok: true, skipped: true, sink }
	}

	if (sink === "log" || sink === "both") {
		logger.info(input.event, payload)
	}

	if (sink === "db" || sink === "both") {
		void persistFunnelEventToAudit(input.event, payload).catch((error) => {
			logger.warn("provider.settings.funnel.persist_failed", {
				event: input.event,
				providerId: payload.providerId,
				error: error instanceof Error ? error.message : String(error),
			})
			if (sink === "db") {
				// Best-effort fallback so drop-off is not lost when DB is down.
				logger.info(input.event, { ...payload, persistFallback: true })
			}
		})
	}

	return { ok: true, sink }
}

export function emitSettingsFunnelDomainCompletions(params: {
	providerId: string
	previousReadiness: Array<{ id?: string; complete?: boolean }>
	nextReadiness: Array<{ id?: string; complete?: boolean }>
	progressPercent?: number | null
	actorUserId?: string | null
}) {
	const previousComplete = new Set(
		params.previousReadiness
			.filter((item) => item.complete)
			.map((item) => String(item.id ?? "").trim())
			.filter(Boolean)
	)

	for (const item of params.nextReadiness) {
		const id = String(item.id ?? "").trim()
		if (!id || !item.complete || previousComplete.has(id)) continue
		const domain = normalizeSettingsFunnelDomain(id)
		if (!domain) continue
		emitProviderSettingsFunnelEvent({
			event: SETTINGS_FUNNEL_EVENTS.domainComplete,
			providerId: params.providerId,
			domain,
			progressPercent: params.progressPercent,
			actorUserId: params.actorUserId,
			surface: "unknown",
		})
	}
}

/** Query persisted funnel events (SETTINGS_FUNNEL_SINK=db|both). */
export async function listProviderSettingsFunnelEvents(params: {
	providerId?: string | null
	limit?: number
	event?: SettingsFunnelEventName | null
	domain?: SettingsFunnelDomain | null
}) {
	const providerId = cleanString(params.providerId, 80)
	const limit = Math.max(1, Math.min(200, Number(params.limit) || 50))
	const eventFilter = params.event && isSettingsFunnelEventName(params.event) ? params.event : null
	const domainFilter = normalizeSettingsFunnelDomain(params.domain)

	const rows = await db
		.select({
			id: ProviderAuditLog.id,
			providerId: ProviderAuditLog.providerId,
			action: ProviderAuditLog.action,
			entityId: ProviderAuditLog.entityId,
			afterJson: ProviderAuditLog.afterJson,
			createdAt: ProviderAuditLog.createdAt,
		})
		.from(ProviderAuditLog)
		.where(
			and(
				eq(ProviderAuditLog.entityType, FUNNEL_ENTITY_TYPE),
				...(providerId ? [eq(ProviderAuditLog.providerId, providerId)] : []),
				...(eventFilter ? [eq(ProviderAuditLog.action, eventFilter)] : [])
			)
		)
		.orderBy(desc(ProviderAuditLog.createdAt))
		.limit(Math.max(limit, domainFilter ? Math.min(500, limit * 5) : limit))
		.catch(() => [])

	const mapped = rows.map((row) => {
		const after =
			row.afterJson && typeof row.afterJson === "object" && !Array.isArray(row.afterJson)
				? (row.afterJson as Record<string, unknown>)
				: {}
		return {
			id: row.id,
			providerId: row.providerId,
			action: String(row.action),
			entityId: row.entityId ?? null,
			domain: normalizeSettingsFunnelDomain(after.domain ?? row.entityId),
			blockerId: cleanString(after.blockerId, 80),
			ctaKind: cleanString(after.ctaKind, 40),
			surface: cleanString(after.surface, 40) ?? "unknown",
			progressPercent: typeof after.progressPercent === "number" ? after.progressPercent : null,
			createdAt: row.createdAt ?? null,
			payload: after,
		}
	})

	if (!domainFilter) return mapped.slice(0, limit)
	return mapped.filter((row) => row.domain === domainFilter).slice(0, limit)
}

function conversionRate(numerator: number, denominator: number): number | null {
	if (!denominator) return null
	return Math.round((numerator / denominator) * 1000) / 10
}

/** Drop-off style counts by event action for a provider (or all if providerId omitted). */
export async function summarizeProviderSettingsFunnel(params?: { providerId?: string | null }) {
	const providerId = cleanString(params?.providerId, 80)
	const rows = await db
		.select({
			action: ProviderAuditLog.action,
			count: sql<number>`count(*)`,
		})
		.from(ProviderAuditLog)
		.where(
			providerId
				? and(
						eq(ProviderAuditLog.entityType, FUNNEL_ENTITY_TYPE),
						eq(ProviderAuditLog.providerId, providerId)
					)
				: eq(ProviderAuditLog.entityType, FUNNEL_ENTITY_TYPE)
		)
		.groupBy(ProviderAuditLog.action)
		.catch(() => [])

	const counts: Record<string, number> = {}
	for (const row of rows) {
		counts[String(row.action)] = Number(row.count) || 0
	}
	const blockerShown = counts[SETTINGS_FUNNEL_EVENTS.blockerShown] ?? 0
	const ctaClicked = counts[SETTINGS_FUNNEL_EVENTS.ctaClicked] ?? 0
	const domainComplete = counts[SETTINGS_FUNNEL_EVENTS.domainComplete] ?? 0
	return {
		blockerShown,
		ctaClicked,
		domainComplete,
		ctaRatePercent: conversionRate(ctaClicked, blockerShown),
		completeRatePercent: conversionRate(domainComplete, blockerShown),
		sink: resolveSettingsFunnelSink(),
		queryable: ["db", "both"].includes(resolveSettingsFunnelSink()),
	}
}

/** Per-domain funnel counts (blocker / CTA / complete) for drop-off analysis. */
export async function summarizeProviderSettingsFunnelByDomain(params?: {
	providerId?: string | null
}) {
	const events = await listProviderSettingsFunnelEvents({
		providerId: params?.providerId,
		limit: 500,
	})
	const byDomain: Record<
		string,
		{ blockerShown: number; ctaClicked: number; domainComplete: number }
	> = {}

	for (const domain of DOMAIN_ALLOWLIST) {
		byDomain[domain] = { blockerShown: 0, ctaClicked: 0, domainComplete: 0 }
	}

	for (const row of events) {
		const domain = row.domain ?? "unknown"
		if (!byDomain[domain]) {
			byDomain[domain] = { blockerShown: 0, ctaClicked: 0, domainComplete: 0 }
		}
		if (row.action === SETTINGS_FUNNEL_EVENTS.blockerShown) byDomain[domain].blockerShown += 1
		else if (row.action === SETTINGS_FUNNEL_EVENTS.ctaClicked) byDomain[domain].ctaClicked += 1
		else if (row.action === SETTINGS_FUNNEL_EVENTS.domainComplete)
			byDomain[domain].domainComplete += 1
	}

	return Object.entries(byDomain)
		.map(([domain, counts]) => ({
			domain,
			...counts,
			ctaRatePercent: conversionRate(counts.ctaClicked, counts.blockerShown),
			completeRatePercent: conversionRate(counts.domainComplete, counts.blockerShown),
		}))
		.filter((row) => row.blockerShown > 0 || row.ctaClicked > 0 || row.domainComplete > 0)
		.sort((a, b) => b.blockerShown - a.blockerShown)
}

/** Ops status for admin / readiness scripts. */
export function getSettingsFunnelQueryStatus(): {
	sink: SettingsFunnelSink
	queryable: boolean
	hostLabel: string
	adminHint: string
} {
	const sink = resolveSettingsFunnelSink()
	if (sink === "noop") {
		return {
			sink,
			queryable: false,
			hostLabel: "Funnel desactivado",
			adminHint: "SETTINGS_FUNNEL_SINK=noop — no se emite ni persiste.",
		}
	}
	if (sink === "log") {
		return {
			sink,
			queryable: false,
			hostLabel: "Funnel solo en logs",
			adminHint: "Eventos en logger.info. Para query SQL/API: SETTINGS_FUNNEL_SINK=db|both.",
		}
	}
	if (sink === "db") {
		return {
			sink,
			queryable: true,
			hostLabel: "Funnel queryable (DB)",
			adminHint:
				"Persiste en ProviderAuditLog (entityType=SettingsFunnel). GET /api/admin/providers/settings-funnel.",
		}
	}
	return {
		sink,
		queryable: true,
		hostLabel: "Funnel queryable (DB + logs)",
		adminHint:
			"Log + ProviderAuditLog. Consulta list/summarize o GET /api/admin/providers/settings-funnel.",
	}
}
