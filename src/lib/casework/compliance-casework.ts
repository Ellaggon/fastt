import {
	and,
	CaseAssignmentEvent,
	CaseDecision,
	CaseActivityEvent,
	CaseSlaTimer,
	CaseTask,
	ComplianceCase,
	CompliancePolicySet,
	CompliancePolicyVersion,
	ComplianceRequirementRule,
	db,
	desc,
	DomainEventOutbox,
	eq,
	inArray,
	lt,
	ProviderComplianceAssignment,
} from "@/shared/infrastructure/db/compat"
import { listPendingProviderDocumentsForAdmin } from "@/lib/provider-documents"
import { listPendingProviderPaymentAccountsForAdmin } from "@/lib/provider-payment-accounts"
import { listPendingProviderVerificationsForAdmin } from "@/lib/provider-admin-compliance"
import { listProviderTaxConfigurationsForAdmin } from "@/lib/provider-tax-configuration"
import { getFeatureFlag, isCommandCenterV2PilotProvider } from "@/config/featureFlags"

export const CASE_DOMAINS = ["verification", "fiscal", "documents", "payments"] as const
export type CaseDomain = (typeof CASE_DOMAINS)[number]
export type ComplianceCaseSource = {
	providerId: string
	domain: CaseDomain
	sourceType: string
	sourceRef: string
	summary: string
}

const ACTIVE_CASE_STATUSES = ["open", "in_review", "waiting_information", "blocked"] as const
const POLICY_CONTEXT = { country: "BO", vertical: "accommodation", collectionModel: "intermediary" }

/** Call within the review transaction, before changing the owned source record. */
export async function assertLegacyComplianceReviewAllowed(
	source: Pick<ComplianceCaseSource, "providerId" | "domain" | "sourceType" | "sourceRef">
) {
	const fail = (code: string, status = 409): never => {
		throw Object.assign(new Error(code), { status })
	}
	if (!getFeatureFlag("COMMAND_CENTER_LEGACY_WRITE_ENABLED")) fail("legacy_review_disabled", 503)
	const cases = await db
		.select({
			id: ComplianceCase.id,
			status: ComplianceCase.status,
			riskTier: ComplianceCase.riskTier,
		})
		.from(ComplianceCase)
		.where(
			and(
				eq(ComplianceCase.providerId, source.providerId),
				eq(ComplianceCase.domain, source.domain),
				eq(ComplianceCase.sourceType, source.sourceType),
				eq(ComplianceCase.sourceRef, source.sourceRef),
				inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES])
			)
		)
		.for("update")
	if (cases.length) {
		const pending = await db
			.select({ id: CaseDecision.id })
			.from(CaseDecision)
			.where(
				and(
					inArray(
						CaseDecision.caseId,
						cases.map((item) => item.id)
					),
					inArray(CaseDecision.status, [
						"proposed",
						"pending_approval",
						"approved",
						"applying",
						"failed",
					])
				)
			)
			.limit(1)
		if (pending.length) fail("casework_decision_pending")
		if (cases.some((item) => item.status === "waiting_information"))
			fail("case_waiting_information")
		if (cases.some((item) => item.riskTier !== "standard")) fail("casework_review_required")
	}
	if (
		getFeatureFlag("COMMAND_CENTER_V2_COMMANDS_ENABLED") &&
		isCommandCenterV2PilotProvider(source.providerId)
	)
		fail("casework_review_required")
}

function caseNumber(id: string) {
	return `CC-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`
}

async function activePolicyVersion() {
	const row = await db
		.select({ id: CompliancePolicyVersion.id })
		.from(CompliancePolicyVersion)
		.innerJoin(CompliancePolicySet, eq(CompliancePolicyVersion.policySetId, CompliancePolicySet.id))
		.where(
			and(
				eq(CompliancePolicySet.country, POLICY_CONTEXT.country),
				eq(CompliancePolicySet.vertical, POLICY_CONTEXT.vertical),
				eq(CompliancePolicySet.collectionModel, POLICY_CONTEXT.collectionModel),
				eq(CompliancePolicySet.status, "active"),
				eq(CompliancePolicyVersion.status, "published")
			)
		)
		.orderBy(desc(CompliancePolicyVersion.effectiveFrom), desc(CompliancePolicyVersion.version))
		.limit(1)
	return row[0] ?? null
}

export async function resolveRequirements(domain: CaseDomain) {
	const policy = await activePolicyVersion()
	if (!policy) throw new Error("compliance_policy_not_published")
	const rules = await db
		.select({
			requirementKey: ComplianceRequirementRule.requirementKey,
			slaHours: ComplianceRequirementRule.slaHours,
		})
		.from(ComplianceRequirementRule)
		.where(
			and(
				eq(ComplianceRequirementRule.policyVersionId, policy.id),
				eq(ComplianceRequirementRule.domain, domain),
				eq(ComplianceRequirementRule.required, true)
			)
		)
		.orderBy(ComplianceRequirementRule.requirementKey)
	return { policyVersionId: policy.id, rules }
}

export async function listCurrentComplianceCaseSources(): Promise<ComplianceCaseSource[]> {
	const [verifications, taxConfigurations, documents, paymentAccounts] = await Promise.all([
		listPendingProviderVerificationsForAdmin(),
		listProviderTaxConfigurationsForAdmin(),
		listPendingProviderDocumentsForAdmin(),
		listPendingProviderPaymentAccountsForAdmin(),
	])
	return [
		...verifications.map((row) => ({
			providerId: row.providerId,
			domain: "verification" as const,
			sourceType: "ProviderVerification",
			sourceRef: row.providerId,
			summary: "Revisión de identidad y negocio del proveedor",
		})),
		...taxConfigurations
			.filter((row) => row.status === "pending")
			.map((row) => ({
				providerId: row.providerId,
				domain: "fiscal" as const,
				sourceType: "ProviderTaxConfiguration",
				sourceRef: row.providerId,
				summary: "Revisión de identidad fiscal",
			})),
		...documents.map((row) => ({
			providerId: row.providerId,
			domain: "documents" as const,
			sourceType: "ProviderDocument",
			sourceRef: row.id,
			summary: `Revisión documental: ${row.type}`,
		})),
		...paymentAccounts.map((row) => ({
			providerId: row.providerId,
			domain: "payments" as const,
			sourceType: "ProviderPaymentAccount",
			sourceRef: row.id,
			summary: "Revisión de cuenta de payout",
		})),
	]
}

async function legacyAssignment(source: ComplianceCaseSource) {
	const rows = await db
		.select()
		.from(ProviderComplianceAssignment)
		.where(
			and(
				eq(ProviderComplianceAssignment.providerId, source.providerId),
				eq(ProviderComplianceAssignment.domain, source.domain),
				eq(ProviderComplianceAssignment.entityId, source.sourceRef),
				eq(ProviderComplianceAssignment.status, "open")
			)
		)
		.limit(1)
	return rows[0] ?? null
}

/** Idempotently creates the unique active case for a canonical pending source. */
export async function synchronizeComplianceCase(source: ComplianceCaseSource) {
	const existing = await db
		.select()
		.from(ComplianceCase)
		.where(
			and(
				eq(ComplianceCase.providerId, source.providerId),
				eq(ComplianceCase.domain, source.domain),
				eq(ComplianceCase.sourceType, source.sourceType),
				eq(ComplianceCase.sourceRef, source.sourceRef),
				inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES])
			)
		)
		.orderBy(desc(ComplianceCase.openedAt))
		.limit(1)
	if (existing[0]) return { caseId: existing[0].id, created: false }
	const [{ policyVersionId, rules }, assignment] = await Promise.all([
		resolveRequirements(source.domain),
		legacyAssignment(source),
	])
	const now = new Date()
	const id = crypto.randomUUID()
	const slaHours = Math.min(...rules.map((rule) => Number(rule.slaHours)), 48)
	const dueAt = assignment?.slaDueAt ?? new Date(now.getTime() + slaHours * 60 * 60 * 1000)
	try {
		await db.transaction(async (tx) => {
			await tx.insert(ComplianceCase).values({
				id,
				caseNumber: caseNumber(id),
				providerId: source.providerId,
				domain: source.domain,
				sourceType: source.sourceType,
				sourceRef: source.sourceRef,
				policyVersionId,
				summary: source.summary,
				status: "open",
				stage: "triage",
				priority: "normal",
				riskTier: "standard",
				version: 1,
				openedAt: now,
				createdAt: now,
				updatedAt: now,
			})
			for (const rule of rules) {
				const taskId = crypto.randomUUID()
				await tx.insert(CaseTask).values({
					id: taskId,
					caseId: id,
					taskKey: `requirement:${rule.requirementKey}`,
					requirementKey: rule.requirementKey,
					status: "open",
					assigneeEmail: assignment?.assigneeEmail ?? undefined,
					dueAt,
					version: 1,
					createdAt: now,
					updatedAt: now,
				})
				if (assignment?.assigneeEmail)
					await tx.insert(CaseAssignmentEvent).values({
						id: crypto.randomUUID(),
						caseId: id,
						taskId,
						eventType: "backfilled",
						toAssigneeEmail: assignment.assigneeEmail,
						actorUserId: assignment.createdBy ?? undefined,
						createdAt: now,
					})
			}
			await tx.insert(CaseSlaTimer).values({
				id: crypto.randomUUID(),
				caseId: id,
				timerKey: "resolution",
				policyKey: `policy:${policyVersionId}`,
				status: "running",
				startedAt: now,
				dueAt,
				createdAt: now,
				updatedAt: now,
			})
			await tx.insert(DomainEventOutbox).values({
				id: crypto.randomUUID(),
				eventType: "case.opened",
				aggregateType: "ComplianceCase",
				aggregateId: id,
				dedupeKey: `case.opened:${id}:1`,
				payloadJson: {
					caseId: id,
					providerId: source.providerId,
					domain: source.domain,
					sourceRef: source.sourceRef,
					version: 1,
				},
				status: "pending",
				attempts: 0,
				availableAt: now,
				createdAt: now,
			})
		})
		return { caseId: id, created: true }
	} catch (error) {
		// Concurrent reconcilers can collide on the partial unique index; return its winner.
		const winner = await db
			.select({ id: ComplianceCase.id })
			.from(ComplianceCase)
			.where(
				and(
					eq(ComplianceCase.providerId, source.providerId),
					eq(ComplianceCase.domain, source.domain),
					eq(ComplianceCase.sourceType, source.sourceType),
					eq(ComplianceCase.sourceRef, source.sourceRef),
					inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES])
				)
			)
			.limit(1)
		if (winner[0]) return { caseId: winner[0].id, created: false }
		throw error
	}
}

export async function resolveComplianceCaseForSource(
	source: Pick<ComplianceCaseSource, "providerId" | "domain" | "sourceType" | "sourceRef">,
	resolutionCode = "source_no_longer_pending"
) {
	const rows = await db
		.select({ id: ComplianceCase.id, version: ComplianceCase.version })
		.from(ComplianceCase)
		.where(
			and(
				eq(ComplianceCase.providerId, source.providerId),
				eq(ComplianceCase.domain, source.domain),
				eq(ComplianceCase.sourceType, source.sourceType),
				eq(ComplianceCase.sourceRef, source.sourceRef),
				inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES])
			)
		)
	const now = new Date()
	let resolved = 0
	for (const row of rows) {
		const version = Number(row.version) + 1
		const completed = await db.transaction(async (tx) => {
			const [locked] = await tx
				.select({ version: ComplianceCase.version, status: ComplianceCase.status })
				.from(ComplianceCase)
				.where(eq(ComplianceCase.id, row.id))
				.for("update")
			if (
				!locked ||
				locked.status === "waiting_information" ||
				locked.version !== row.version ||
				!ACTIVE_CASE_STATUSES.includes(locked.status as (typeof ACTIVE_CASE_STATUSES)[number])
			)
				return false
			const pending = await tx
				.select({ id: CaseDecision.id })
				.from(CaseDecision)
				.where(
					and(
						eq(CaseDecision.caseId, row.id),
						inArray(CaseDecision.status, [
							"proposed",
							"pending_approval",
							"approved",
							"applying",
							"failed",
						])
					)
				)
				.limit(1)
			if (pending.length) return false
			await tx
				.update(ComplianceCase)
				.set({
					status: "resolved",
					stage: "decision",
					resolutionCode,
					resolvedAt: now,
					updatedAt: now,
					version,
				})
				.where(eq(ComplianceCase.id, row.id))
			await tx
				.update(CaseTask)
				.set({ status: "completed", completedAt: now, updatedAt: now })
				.where(
					and(
						eq(CaseTask.caseId, row.id),
						inArray(CaseTask.status, ["open", "in_progress", "blocked"])
					)
				)
			await tx
				.update(CaseSlaTimer)
				.set({ status: "stopped", stoppedAt: now, updatedAt: now })
				.where(
					and(
						eq(CaseSlaTimer.caseId, row.id),
						inArray(CaseSlaTimer.status, ["running", "paused", "breached"])
					)
				)
			await tx.insert(CaseActivityEvent).values({
				id: crypto.randomUUID(),
				caseId: row.id,
				eventType: "source_reconciled",
				summary:
					"La fuente ya no está pendiente; cierre por reconciliación, sin nueva decisión humana",
				metadataJson: { resolutionCode },
				createdAt: now,
			})
			await tx.insert(DomainEventOutbox).values({
				id: crypto.randomUUID(),
				eventType: "case.resolved",
				aggregateType: "ComplianceCase",
				aggregateId: row.id,
				dedupeKey: `case.resolved:${row.id}:${version}`,
				payloadJson: {
					caseId: row.id,
					providerId: source.providerId,
					domain: source.domain,
					resolutionCode,
					version,
				},
				status: "pending",
				attempts: 0,
				availableAt: now,
				createdAt: now,
			})
			return true
		})
		if (completed) resolved++
	}
	return resolved
}

function isPreCaseworkDeployment(error: unknown) {
	const message = error instanceof Error ? error.message : String(error)
	return (
		message === "compliance_policy_not_published" ||
		/ComplianceCase|CompliancePolicy|CaseTask|relation .* does not exist/i.test(message)
	)
}

/** Temporary dual-write compatibility while an additive migration rolls out. */
export async function synchronizeComplianceCaseCompat(source: ComplianceCaseSource) {
	try {
		return await synchronizeComplianceCase(source)
	} catch (error) {
		if (!isPreCaseworkDeployment(error)) throw error
		console.warn("casework.sync.deferred_until_migration", {
			domain: source.domain,
			sourceRef: source.sourceRef,
		})
		return null
	}
}

export async function resolveComplianceCaseForSourceCompat(
	source: Pick<ComplianceCaseSource, "providerId" | "domain" | "sourceType" | "sourceRef">,
	resolutionCode?: string
) {
	try {
		return await resolveComplianceCaseForSource(source, resolutionCode)
	} catch (error) {
		if (!isPreCaseworkDeployment(error)) throw error
		console.warn("casework.resolve.deferred_until_migration", {
			domain: source.domain,
			sourceRef: source.sourceRef,
		})
		return 0
	}
}

/** Mirrors the legacy assignment while preserving an append-only casework history. */
export async function synchronizeCaseAssignment(params: {
	source: ComplianceCaseSource
	assigneeEmail: string | null
	actorUserId?: string | null
}) {
	// Assignments remain the operational source of truth. Casework dual-write must
	// never fail the legacy upsert when the additive schema/policy is not ready.
	const ensured = await synchronizeComplianceCaseCompat(params.source)
	if (!ensured) return null
	const tasks = await db
		.select({ id: CaseTask.id, assigneeEmail: CaseTask.assigneeEmail })
		.from(CaseTask)
		.where(eq(CaseTask.caseId, ensured.caseId))
	const now = new Date()
	for (const task of tasks) {
		const previous = task.assigneeEmail ?? null
		if (previous === params.assigneeEmail) continue
		await db.transaction(async (tx) => {
			await tx
				.update(CaseTask)
				.set({ assigneeEmail: params.assigneeEmail ?? undefined, updatedAt: now })
				.where(eq(CaseTask.id, task.id))
			await tx.insert(CaseAssignmentEvent).values({
				id: crypto.randomUUID(),
				caseId: ensured.caseId,
				taskId: task.id,
				eventType: params.assigneeEmail ? (previous ? "reassigned" : "assigned") : "unassigned",
				fromAssigneeEmail: previous ?? undefined,
				toAssigneeEmail: params.assigneeEmail ?? undefined,
				actorUserId: params.actorUserId ?? undefined,
				createdAt: now,
			})
		})
	}
	return ensured
}

export async function reconcileComplianceCases(options: { providerId?: string } = {}) {
	const sources = (await listCurrentComplianceCaseSources()).filter(
		(source) => !options.providerId || source.providerId === options.providerId
	)
	const keys = new Set(
		sources.map(
			(source) => `${source.providerId}:${source.domain}:${source.sourceType}:${source.sourceRef}`
		)
	)
	const created = await Promise.all(sources.map(synchronizeComplianceCase))
	const activeCases = await db
		.select({
			id: ComplianceCase.id,
			providerId: ComplianceCase.providerId,
			domain: ComplianceCase.domain,
			sourceType: ComplianceCase.sourceType,
			sourceRef: ComplianceCase.sourceRef,
		})
		.from(ComplianceCase)
		.where(
			and(
				inArray(ComplianceCase.status, [...ACTIVE_CASE_STATUSES]),
				options.providerId ? eq(ComplianceCase.providerId, options.providerId) : undefined
			)
		)
	let resolved = 0
	for (const row of activeCases) {
		const key = `${row.providerId}:${row.domain}:${row.sourceType}:${row.sourceRef}`
		if (!keys.has(key))
			resolved += await resolveComplianceCaseForSource({
				providerId: row.providerId,
				domain: row.domain as CaseDomain,
				sourceType: row.sourceType,
				sourceRef: row.sourceRef,
			})
	}
	const activeAfterReconciliation = activeCases.length - resolved
	return {
		sources: sources.length,
		created: created.filter((result) => result.created).length,
		existing: created.filter((result) => !result.created).length,
		resolved,
		activeAfterReconciliation,
		gatePassed: activeAfterReconciliation === sources.length,
	}
}

/** Current worker has an internal projection consumer; it is safe to run repeatedly. */
export async function publishComplianceOutbox(params: { limit?: number; workerId?: string } = {}) {
	const now = new Date(),
		workerId = params.workerId ?? "compliance-case-cron",
		limit = Math.min(Math.max(params.limit ?? 100, 1), 250)
	const candidates = await db
		.select({ id: DomainEventOutbox.id })
		.from(DomainEventOutbox)
		.where(and(eq(DomainEventOutbox.status, "pending"), lt(DomainEventOutbox.availableAt, now)))
		.orderBy(DomainEventOutbox.createdAt)
		.limit(limit)
	let published = 0
	for (const candidate of candidates) {
		const claimed = await db
			.update(DomainEventOutbox)
			.set({ status: "processing", lockedAt: now, lockedBy: workerId, attempts: 1 })
			.where(and(eq(DomainEventOutbox.id, candidate.id), eq(DomainEventOutbox.status, "pending")))
			.returning({ id: DomainEventOutbox.id })
		if (!claimed[0]) continue
		await db
			.update(DomainEventOutbox)
			.set({ status: "published", publishedAt: new Date() })
			.where(eq(DomainEventOutbox.id, candidate.id))
		published += 1
	}
	return { published }
}
