import {
	AuditEvent,
	db,
	desc,
	eq,
	gte,
	inArray,
	lte,
	Provider,
	User,
} from "@/shared/infrastructure/db/compat"

export const AUDIT_OUTCOMES = ["attempted", "succeeded", "denied", "failed"] as const
export const AUDIT_RISK_LEVELS = ["low", "medium", "high", "critical"] as const

export type AuditOutcomeFilter = (typeof AUDIT_OUTCOMES)[number]
export type AuditRiskLevelFilter = (typeof AUDIT_RISK_LEVELS)[number]

export type AuditConsoleFilters = {
	providerId?: string
	requestId?: string
	action?: string
	outcome?: AuditOutcomeFilter
	riskLevel?: AuditRiskLevelFilter
	from?: Date
	to?: Date
	limit?: number
}

function nonEmpty(value: string | null | undefined, maxLength = 160): string | undefined {
	const normalized = String(value ?? "").trim()
	return normalized ? normalized.slice(0, maxLength) : undefined
}

function parseIsoDate(value: string | null, endOfDay = false): Date | undefined {
	const raw = nonEmpty(value, 32)
	if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined
	const parsed = new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
	return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function isOutcome(value: string | undefined): value is AuditOutcomeFilter {
	return Boolean(value && (AUDIT_OUTCOMES as readonly string[]).includes(value))
}

function isRiskLevel(value: string | undefined): value is AuditRiskLevelFilter {
	return Boolean(value && (AUDIT_RISK_LEVELS as readonly string[]).includes(value))
}

export function parseAuditConsoleFilters(searchParams: URLSearchParams): AuditConsoleFilters {
	const outcome = nonEmpty(searchParams.get("outcome"), 24)
	const riskLevel = nonEmpty(searchParams.get("risk"), 24)
	return {
		providerId: nonEmpty(searchParams.get("providerId")),
		requestId: nonEmpty(searchParams.get("requestId")),
		action: nonEmpty(searchParams.get("action")),
		outcome: isOutcome(outcome) ? outcome : undefined,
		riskLevel: isRiskLevel(riskLevel) ? riskLevel : undefined,
		from: parseIsoDate(searchParams.get("from")),
		to: parseIsoDate(searchParams.get("to"), true),
		limit: 150,
	}
}

export type AuditConsoleEvent = {
	id: string
	requestId: string | null
	action: string
	entityType: string
	entityId: string | null
	outcome: AuditOutcomeFilter
	riskLevel: AuditRiskLevelFilter
	providerId: string | null
	providerLabel: string | null
	actorUserId: string | null
	actorLabel: string | null
	actorRoles: string[]
	context: Record<string, unknown> | null
	createdAt: Date | null
}

/**
 * Read model for the internal audit console. The write path already redacts payloads;
 * this projection deliberately leaves before/after snapshots out of the UI so the
 * monitoring surface remains useful without becoming an evidence-exfiltration tool.
 */
export async function loadAuditConsoleEvents(
	filters: AuditConsoleFilters
): Promise<AuditConsoleEvent[]> {
	const conditions = []
	if (filters.providerId) conditions.push(eq(AuditEvent.providerId, filters.providerId))
	if (filters.requestId) conditions.push(eq(AuditEvent.requestId, filters.requestId))
	if (filters.action) conditions.push(eq(AuditEvent.action, filters.action))
	if (filters.outcome) conditions.push(eq(AuditEvent.outcome, filters.outcome))
	if (filters.riskLevel) conditions.push(eq(AuditEvent.riskLevel, filters.riskLevel))
	if (filters.from) conditions.push(gte(AuditEvent.createdAt, filters.from))
	if (filters.to) conditions.push(lte(AuditEvent.createdAt, filters.to))

	let query = db.select().from(AuditEvent).$dynamic()
	for (const condition of conditions) query = query.where(condition)
	const rows = await query
		.orderBy(desc(AuditEvent.createdAt))
		.limit(Math.min(Math.max(filters.limit ?? 150, 1), 250))

	const actorIds = [
		...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id))),
	]
	const providerIds = [
		...new Set(rows.map((row) => row.providerId).filter((id): id is string => Boolean(id))),
	]
	const [actors, providers] = await Promise.all([
		actorIds.length
			? db
					.select({ id: User.id, email: User.email, username: User.username })
					.from(User)
					.where(inArray(User.id, actorIds))
			: Promise.resolve([]),
		providerIds.length
			? db
					.select({
						id: Provider.id,
						displayName: Provider.displayName,
						legalName: Provider.legalName,
					})
					.from(Provider)
					.where(inArray(Provider.id, providerIds))
			: Promise.resolve([]),
	])
	const actorById = new Map(
		actors.map((actor) => [actor.id, actor.email || actor.username || actor.id])
	)
	const providerById = new Map(
		providers.map((provider) => [
			provider.id,
			provider.displayName || provider.legalName || provider.id,
		])
	)

	return rows.map((row) => ({
		id: row.id,
		requestId: row.requestId,
		action: row.action,
		entityType: row.entityType,
		entityId: row.entityId,
		outcome: row.outcome as AuditOutcomeFilter,
		riskLevel: row.riskLevel as AuditRiskLevelFilter,
		providerId: row.providerId,
		providerLabel: row.providerId ? (providerById.get(row.providerId) ?? row.providerId) : null,
		actorUserId: row.actorUserId,
		actorLabel: row.actorUserId ? (actorById.get(row.actorUserId) ?? row.actorUserId) : null,
		actorRoles: Array.isArray(row.actorRoleKeysJson)
			? row.actorRoleKeysJson.filter((role): role is string => typeof role === "string")
			: [],
		context:
			row.contextJson && typeof row.contextJson === "object" && !Array.isArray(row.contextJson)
				? (row.contextJson as Record<string, unknown>)
				: null,
		createdAt: row.createdAt,
	}))
}
