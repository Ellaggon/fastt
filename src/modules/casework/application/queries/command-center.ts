import type { SQL } from "drizzle-orm"

import {
	and,
	asc,
	CaseActivityEvent,
	CaseDecision,
	CaseSlaTimer,
	CaseTask,
	ComplianceCase,
	ComplianceDecisionReason,
	db,
	desc,
	eq,
	inArray,
	lt,
	or,
	Provider,
	SavedCaseView,
	sql,
} from "@/shared/infrastructure/db/compat"

export const ACTIVE_CASE_STATUSES = ["open", "in_review", "waiting_information", "blocked"] as const
export const CASE_DOMAINS = ["verification", "fiscal", "documents", "payments"] as const

export type CaseListFilters = {
	domain?: string | null
	status?: string | null
	priority?: string | null
	riskTier?: string | null
	assigneeUserId?: string | null
	assigneeEmail?: string | null
	sla?: "overdue" | "due_soon" | null
	search?: string | null
	unassigned?: boolean
	pendingSecondControlForUserId?: string | null
	cursor?: string | null
	limit?: number
}

type Cursor = { openedAt: string; id: string }

function encodeCursor(value: Cursor) {
	return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

function decodeCursor(raw: string | null | undefined): Cursor | null {
	if (!raw) return null
	try {
		const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor
		if (!value.id || !Number.isFinite(new Date(value.openedAt).getTime())) return null
		return value
	} catch {
		return null
	}
}

function normalizedLimit(value: number | undefined) {
	return Math.min(Math.max(Number(value ?? 40) || 40, 1), 100)
}

function escapeLike(value: string) {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export async function listCommandCenterCases(filters: CaseListFilters = {}) {
	const limit = normalizedLimit(filters.limit)
	const cursor = decodeCursor(filters.cursor)
	const conditions: SQL[] = []

	if (filters.status) conditions.push(eq(ComplianceCase.status, filters.status))
	else conditions.push(inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES]))
	if (filters.domain && CASE_DOMAINS.includes(filters.domain as (typeof CASE_DOMAINS)[number]))
		conditions.push(eq(ComplianceCase.domain, filters.domain))
	if (filters.priority) conditions.push(eq(ComplianceCase.priority, filters.priority))
	if (filters.riskTier) conditions.push(eq(ComplianceCase.riskTier, filters.riskTier))
	if (filters.unassigned) {
		conditions.push(sql`NOT EXISTS (
			SELECT 1 FROM "CaseTask" task
			WHERE task."caseId" = ${ComplianceCase.id}
			  AND task."status" IN ('open', 'in_progress', 'blocked')
			  AND (task."assigneeUserId" IS NOT NULL OR task."assigneeEmail" IS NOT NULL)
		)`)
	}
	if (filters.pendingSecondControlForUserId) {
		conditions.push(sql`EXISTS (
			SELECT 1 FROM "CaseDecision" decision
			WHERE decision."caseId" = ${ComplianceCase.id}
			  AND decision."status" = 'pending_approval'
			  AND decision."proposedByUserId" <> ${filters.pendingSecondControlForUserId}
		)`)
	}
	if (filters.assigneeUserId || filters.assigneeEmail) {
		const assigned = await db
			.select({ caseId: CaseTask.caseId })
			.from(CaseTask)
			.where(
				and(
					inArray(CaseTask.status, ["open", "in_progress", "blocked"]),
					filters.assigneeUserId
						? eq(CaseTask.assigneeUserId, filters.assigneeUserId)
						: eq(CaseTask.assigneeEmail, filters.assigneeEmail!)
				)
			)
		const assignedIds = [...new Set(assigned.map((row) => row.caseId))]
		if (!assignedIds.length) return { items: [], nextCursor: null, limit }
		conditions.push(inArray(ComplianceCase.id, assignedIds))
	}
	if (filters.sla) {
		const now = new Date()
		const dueSoon = new Date(now.getTime() + 8 * 60 * 60 * 1000)
		const eligible = await db
			.select({ caseId: CaseSlaTimer.caseId })
			.from(CaseSlaTimer)
			.where(
				filters.sla === "overdue"
					? or(
							eq(CaseSlaTimer.status, "breached"),
							and(eq(CaseSlaTimer.status, "running"), lt(CaseSlaTimer.dueAt, now))
						)!
					: and(
							eq(CaseSlaTimer.status, "running"),
							// due soon but not already overdue
							sql`${CaseSlaTimer.dueAt} >= ${now}`,
							sql`${CaseSlaTimer.dueAt} <= ${dueSoon}`
						)!
			)
		const eligibleIds = [...new Set(eligible.map((row) => row.caseId))]
		if (!eligibleIds.length) return { items: [], nextCursor: null, limit }
		conditions.push(inArray(ComplianceCase.id, eligibleIds))
	}
	if (filters.search) {
		const pattern = `%${escapeLike(filters.search.trim().toLowerCase().slice(0, 100))}%`
		conditions.push(
			or(
				eq(ComplianceCase.id, filters.search.trim()),
				eq(ComplianceCase.caseNumber, filters.search.trim().toUpperCase()),
				eq(ComplianceCase.providerId, filters.search.trim()),
				sql`lower(coalesce(${Provider.displayName}, '')) LIKE ${pattern} ESCAPE '\\'`,
				sql`lower(coalesce(${Provider.legalName}, '')) LIKE ${pattern} ESCAPE '\\'`,
				sql`lower(${ComplianceCase.sourceRef}) LIKE ${pattern} ESCAPE '\\'`
			)!
		)
	}
	if (cursor) {
		const openedAt = new Date(cursor.openedAt)
		conditions.push(
			or(
				lt(ComplianceCase.openedAt, openedAt),
				and(eq(ComplianceCase.openedAt, openedAt), lt(ComplianceCase.id, cursor.id))
			)!
		)
	}

	// Search by human-readable provider fields without exposing raw sensitive sources.
	let rows = await db
		.select({
			id: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			providerId: ComplianceCase.providerId,
			providerName: Provider.displayName,
			providerLegalName: Provider.legalName,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			stage: ComplianceCase.stage,
			priority: ComplianceCase.priority,
			riskTier: ComplianceCase.riskTier,
			summary: ComplianceCase.summary,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
			policyVersionId: ComplianceCase.policyVersionId,
			version: ComplianceCase.version,
			openedAt: ComplianceCase.openedAt,
			updatedAt: ComplianceCase.updatedAt,
		})
		.from(ComplianceCase)
		.innerJoin(Provider, eq(ComplianceCase.providerId, Provider.id))
		.where(and(...conditions))
		.orderBy(desc(ComplianceCase.openedAt), desc(ComplianceCase.id))
		.limit(limit + 1)

	const pageRows = rows.slice(0, limit)
	const caseIds = pageRows.map((row) => row.id)
	const [tasks, timers] = caseIds.length
		? await Promise.all([
				db
					.select({
						caseId: CaseTask.caseId,
						status: CaseTask.status,
						assigneeEmail: CaseTask.assigneeEmail,
						assigneeUserId: CaseTask.assigneeUserId,
					})
					.from(CaseTask)
					.where(inArray(CaseTask.caseId, caseIds)),
				db
					.select({
						caseId: CaseSlaTimer.caseId,
						status: CaseSlaTimer.status,
						dueAt: CaseSlaTimer.dueAt,
					})
					.from(CaseSlaTimer)
					.where(inArray(CaseSlaTimer.caseId, caseIds)),
			])
		: [[], []]
	const now = Date.now()
	const dueSoonAt = now + 8 * 60 * 60 * 1000
	const enriched = pageRows.map((row) => {
		const caseTasks = tasks.filter((task) => task.caseId === row.id)
		const timer = timers.find((candidate) => candidate.caseId === row.id) ?? null
		return {
			...row,
			assigneeEmail: caseTasks.find((task) => task.assigneeEmail)?.assigneeEmail ?? null,
			assigneeUserId: caseTasks.find((task) => task.assigneeUserId)?.assigneeUserId ?? null,
			openTasks: caseTasks.filter((task) =>
				["open", "in_progress", "blocked"].includes(task.status)
			).length,
			slaStatus:
				timer?.status === "breached" || (timer?.status === "running" && timer.dueAt.getTime() < now)
					? "overdue"
					: timer?.status === "running" && timer.dueAt.getTime() <= dueSoonAt
						? "due_soon"
						: (timer?.status ?? "none"),
			slaDueAt: timer?.dueAt ?? null,
		}
	})
	const last = pageRows.at(-1)
	return {
		items: enriched,
		nextCursor:
			rows.length > limit && last
				? encodeCursor({ openedAt: last.openedAt.toISOString(), id: last.id })
				: null,
		limit,
	}
}

export async function getCommandCenterSummary() {
	const cases = await db
		.select({
			id: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			providerId: ComplianceCase.providerId,
			providerName: Provider.displayName,
			providerLegalName: Provider.legalName,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			stage: ComplianceCase.stage,
			priority: ComplianceCase.priority,
			riskTier: ComplianceCase.riskTier,
			summary: ComplianceCase.summary,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
			policyVersionId: ComplianceCase.policyVersionId,
			version: ComplianceCase.version,
			openedAt: ComplianceCase.openedAt,
			updatedAt: ComplianceCase.updatedAt,
		})
		.from(ComplianceCase)
		.innerJoin(Provider, eq(ComplianceCase.providerId, Provider.id))
		.where(inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES]))
		.orderBy(desc(ComplianceCase.openedAt), desc(ComplianceCase.id))
		.limit(2_000)
	const caseIds = cases.map((item) => item.id)
	const [tasks, timers] = caseIds.length
		? await Promise.all([
				db
					.select({
						caseId: CaseTask.caseId,
						assigneeEmail: CaseTask.assigneeEmail,
						assigneeUserId: CaseTask.assigneeUserId,
					})
					.from(CaseTask)
					.where(
						and(
							inArray(CaseTask.caseId, caseIds),
							inArray(CaseTask.status, ["open", "in_progress", "blocked"])
						)
					),
				db
					.select({
						caseId: CaseSlaTimer.caseId,
						status: CaseSlaTimer.status,
						dueAt: CaseSlaTimer.dueAt,
					})
					.from(CaseSlaTimer)
					.where(inArray(CaseSlaTimer.caseId, caseIds)),
			])
		: [[], []]
	const now = Date.now()
	const dueSoonAt = now + 8 * 60 * 60 * 1000
	const items = cases.map((item) => {
		const caseTasks = tasks.filter((task) => task.caseId === item.id)
		const timer = timers.find((candidate) => candidate.caseId === item.id) ?? null
		return {
			...item,
			assigneeEmail: caseTasks.find((task) => task.assigneeEmail)?.assigneeEmail ?? null,
			assigneeUserId: caseTasks.find((task) => task.assigneeUserId)?.assigneeUserId ?? null,
			openTasks: caseTasks.length,
			slaStatus:
				timer?.status === "breached" || (timer?.status === "running" && timer.dueAt.getTime() < now)
					? "overdue"
					: timer?.status === "running" && timer.dueAt.getTime() <= dueSoonAt
						? "due_soon"
						: (timer?.status ?? "none"),
			slaDueAt: timer?.dueAt ?? null,
		}
	})
	const byDomain = Object.fromEntries(CASE_DOMAINS.map((domain) => [domain, 0])) as Record<
		(typeof CASE_DOMAINS)[number],
		number
	>
	for (const item of items) byDomain[item.domain as keyof typeof byDomain] += 1
	return {
		open: items.length,
		overdue: items.filter((item) => item.slaStatus === "overdue").length,
		dueSoon: items.filter((item) => item.slaStatus === "due_soon").length,
		highRisk: items.filter((item) => item.riskTier === "high").length,
		critical: items.filter((item) => item.priority === "critical").length,
		unassigned: items.filter((item) => !item.assigneeUserId && !item.assigneeEmail).length,
		byDomain,
		recent: items.slice(0, 8),
		scope: { country: "BO", vertical: "accommodation", collectionModel: "intermediary" },
	}
}

export async function getCaseWorkspace(caseId: string) {
	const rows = await db
		.select({
			id: ComplianceCase.id,
			caseNumber: ComplianceCase.caseNumber,
			providerId: ComplianceCase.providerId,
			providerName: Provider.displayName,
			providerLegalName: Provider.legalName,
			domain: ComplianceCase.domain,
			status: ComplianceCase.status,
			stage: ComplianceCase.stage,
			priority: ComplianceCase.priority,
			riskTier: ComplianceCase.riskTier,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
			policyVersionId: ComplianceCase.policyVersionId,
			summary: ComplianceCase.summary,
			resolutionCode: ComplianceCase.resolutionCode,
			version: ComplianceCase.version,
			openedAt: ComplianceCase.openedAt,
			updatedAt: ComplianceCase.updatedAt,
		})
		.from(ComplianceCase)
		.innerJoin(Provider, eq(ComplianceCase.providerId, Provider.id))
		.where(eq(ComplianceCase.id, caseId))
		.limit(1)
	const item = rows[0]
	if (!item) return null
	const [tasks, timers, activities, decisions, reasons] = await Promise.all([
		db.select().from(CaseTask).where(eq(CaseTask.caseId, caseId)).orderBy(asc(CaseTask.createdAt)),
		db.select().from(CaseSlaTimer).where(eq(CaseSlaTimer.caseId, caseId)),
		db
			.select()
			.from(CaseActivityEvent)
			.where(eq(CaseActivityEvent.caseId, caseId))
			.orderBy(desc(CaseActivityEvent.createdAt))
			.limit(100),
		db
			.select()
			.from(CaseDecision)
			.where(eq(CaseDecision.caseId, caseId))
			.orderBy(desc(CaseDecision.createdAt)),
		item.policyVersionId
			? db
					.select()
					.from(ComplianceDecisionReason)
					.where(
						and(
							eq(ComplianceDecisionReason.policyVersionId, item.policyVersionId),
							eq(ComplianceDecisionReason.active, true)
						)
					)
			: Promise.resolve([]),
	])
	return { case: item, tasks, timers, activities, decisions, reasons }
}

export async function getProvider360(providerId: string) {
	const providers = await db.select().from(Provider).where(eq(Provider.id, providerId)).limit(1)
	if (!providers[0]) return null
	const cases = await db
		.select()
		.from(ComplianceCase)
		.where(eq(ComplianceCase.providerId, providerId))
		.orderBy(desc(ComplianceCase.openedAt))
		.limit(100)
	return { provider: providers[0], cases }
}

export async function getDecisionAuthorizationContext(decisionId: string) {
	const rows = await db
		.select({
			caseId: ComplianceCase.id,
			providerId: ComplianceCase.providerId,
			domain: ComplianceCase.domain,
			proposedByUserId: CaseDecision.proposedByUserId,
		})
		.from(CaseDecision)
		.innerJoin(ComplianceCase, eq(CaseDecision.caseId, ComplianceCase.id))
		.where(eq(CaseDecision.id, decisionId))
		.limit(1)
	return rows[0] ?? null
}

export async function listSavedCaseViews(ownerUserId: string) {
	return db
		.select()
		.from(SavedCaseView)
		.where(or(eq(SavedCaseView.ownerUserId, ownerUserId), eq(SavedCaseView.scope, "team")))
		.orderBy(desc(SavedCaseView.isDefault), asc(SavedCaseView.name))
}
