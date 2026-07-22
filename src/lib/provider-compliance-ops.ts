import {
	first,
	and,
	db,
	desc,
	eq,
	ProviderComplianceAssignment,
} from "@/shared/infrastructure/db/compat"

/**
 * Ops Trust & Safety assignments + SLA for compliance queues.
 * Airbnb/Expedia ops work items: assignee + due time, not just anonymous piles.
 */

export type ComplianceOpsDomain = "verification" | "fiscal" | "documents" | "payments"

export type ProviderComplianceAssignmentRecord = {
	id: string
	providerId: string
	domain: ComplianceOpsDomain
	entityId: string
	assigneeEmail: string | null
	slaHours: number
	slaDueAt: Date | null
	status: "open" | "done" | "canceled"
	notes: string | null
	createdBy: string | null
	createdAt: Date | null
	updatedAt: Date | null
	slaState: "ok" | "due_soon" | "overdue" | "done"
}

const DEFAULT_SLA_HOURS = 48

function asDomain(value: unknown): ComplianceOpsDomain | null {
	const raw = String(value ?? "").trim()
	if (raw === "verification" || raw === "fiscal" || raw === "documents" || raw === "payments") {
		return raw
	}
	return null
}

function slaStateFor(row: {
	status: string
	slaDueAt: Date | null
}): ProviderComplianceAssignmentRecord["slaState"] {
	if (row.status === "done" || row.status === "canceled") return "done"
	if (!row.slaDueAt) return "ok"
	const due = new Date(row.slaDueAt).getTime()
	const now = Date.now()
	if (due < now) return "overdue"
	if (due - now <= 6 * 60 * 60 * 1000) return "due_soon"
	return "ok"
}

function mapRow(row: {
	id: string
	providerId: string
	domain: string
	entityId: string
	assigneeEmail: string | null
	slaHours: number
	slaDueAt: Date | null
	status: string
	notes: string | null
	createdBy: string | null
	createdAt: Date | null
	updatedAt: Date | null
}): ProviderComplianceAssignmentRecord {
	const domain = asDomain(row.domain) ?? "verification"
	const status =
		row.status === "done" || row.status === "canceled" || row.status === "open"
			? row.status
			: "open"
	return {
		id: row.id,
		providerId: row.providerId,
		domain,
		entityId: row.entityId,
		assigneeEmail: row.assigneeEmail ?? null,
		slaHours: Number(row.slaHours) || DEFAULT_SLA_HOURS,
		slaDueAt: row.slaDueAt ?? null,
		status,
		notes: row.notes ?? null,
		createdBy: row.createdBy ?? null,
		createdAt: row.createdAt ?? null,
		updatedAt: row.updatedAt ?? null,
		slaState: slaStateFor({ status, slaDueAt: row.slaDueAt ?? null }),
	}
}

export async function listOpenComplianceAssignments(params?: {
	providerId?: string
}): Promise<ProviderComplianceAssignmentRecord[]> {
	const rows = await db
		.select()
		.from(ProviderComplianceAssignment)
		.orderBy(desc(ProviderComplianceAssignment.slaDueAt), desc(ProviderComplianceAssignment.id))

		.catch(() => [])

	return rows
		.map(mapRow)
		.filter((row) => row.status === "open")
		.filter((row) => !params?.providerId || row.providerId === params.providerId)
}

export async function upsertComplianceAssignment(params: {
	providerId: string
	domain: unknown
	entityId: string
	assigneeEmail?: unknown
	slaHours?: unknown
	notes?: unknown
	actorUserId: string
}) {
	const domain = asDomain(params.domain)
	if (!domain) {
		const error = new Error("invalid_ops_domain")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	const entityId = String(params.entityId ?? "").trim()
	if (!entityId) {
		const error = new Error("entityId_required")
		;(error as Error & { status?: number }).status = 400
		throw error
	}
	const assigneeEmail =
		String(params.assigneeEmail ?? "")
			.trim()
			.toLowerCase() || null
	const slaHoursRaw = Number(params.slaHours)
	const slaHours =
		Number.isFinite(slaHoursRaw) && slaHoursRaw > 0 ? Math.min(slaHoursRaw, 168) : DEFAULT_SLA_HOURS
	const notes = String(params.notes ?? "").trim() || null
	const now = new Date()
	const slaDueAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000)

	const existing = await db
		.select({ id: ProviderComplianceAssignment.id })
		.from(ProviderComplianceAssignment)
		.where(
			and(
				eq(ProviderComplianceAssignment.providerId, params.providerId),
				eq(ProviderComplianceAssignment.domain, domain),
				eq(ProviderComplianceAssignment.entityId, entityId),
				eq(ProviderComplianceAssignment.status, "open")
			)
		)
		.then(first)
		.catch(() => null)

	if (existing?.id) {
		await db
			.update(ProviderComplianceAssignment)
			.set({
				assigneeEmail: assigneeEmail ?? undefined,
				slaHours,
				slaDueAt,
				notes: notes ?? undefined,
				updatedAt: now,
			})
			.where(eq(ProviderComplianceAssignment.id, existing.id))
		const row = await db
			.select()
			.from(ProviderComplianceAssignment)
			.where(eq(ProviderComplianceAssignment.id, existing.id))
			.then(first)
		return row ? mapRow(row) : null
	}

	const id = crypto.randomUUID()
	await db.insert(ProviderComplianceAssignment).values({
		id,
		providerId: params.providerId,
		domain,
		entityId,
		assigneeEmail: assigneeEmail ?? undefined,
		slaHours,
		slaDueAt,
		status: "open",
		notes: notes ?? undefined,
		createdBy: params.actorUserId,
		createdAt: now,
		updatedAt: now,
	})
	const row = await db
		.select()
		.from(ProviderComplianceAssignment)
		.where(eq(ProviderComplianceAssignment.id, id))
		.then(first)
	return row ? mapRow(row) : null
}

export async function completeComplianceAssignment(params: {
	providerId: string
	domain: unknown
	entityId: string
}) {
	const domain = asDomain(params.domain)
	if (!domain) return
	const entityId = String(params.entityId ?? "").trim()
	const now = new Date()
	const openRows = await db
		.select({ id: ProviderComplianceAssignment.id })
		.from(ProviderComplianceAssignment)
		.where(
			and(
				eq(ProviderComplianceAssignment.providerId, params.providerId),
				eq(ProviderComplianceAssignment.domain, domain),
				eq(ProviderComplianceAssignment.entityId, entityId),
				eq(ProviderComplianceAssignment.status, "open")
			)
		)

		.catch(() => [])

	for (const row of openRows) {
		await db
			.update(ProviderComplianceAssignment)
			.set({ status: "done", updatedAt: now })
			.where(eq(ProviderComplianceAssignment.id, row.id))
	}
}
