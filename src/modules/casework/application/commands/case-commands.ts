import {
	and,
	CaseActivityEvent,
	CaseAssignmentEvent,
	CaseDecision,
	CaseDecisionApproval,
	CaseSlaTimer,
	CaseTask,
	ComplianceCase,
	ComplianceDecisionReason,
	db,
	DomainEventOutbox,
	eq,
	inArray,
	isNull,
	or,
	SavedCaseView,
} from "@/shared/infrastructure/db/compat"
import { providerV2Repository } from "@/container"
import { invalidateProvider, invalidateProviderGovernance } from "@/lib/cache/invalidation"
import { completeComplianceAssignment } from "@/lib/provider-compliance-ops"
import { writeProviderAuditLog } from "@/lib/provider-audit"
import { getLatestProviderVerificationStatus } from "@/lib/provider-admin-compliance"
import { reviewProviderDocument } from "@/lib/provider-documents"
import { reviewProviderPaymentAccount } from "@/lib/provider-payment-accounts"
import { reviewProviderTaxConfiguration } from "@/lib/provider-tax-configuration"
import { setProviderVerificationV2 } from "@/modules/catalog/public"

function commandError(code: string, status: number) {
	const error = new Error(code) as Error & { status: number }
	error.status = status
	return error
}

export async function proposeCaseDecision(input: {
	caseId: string
	expectedVersion: number
	decision: string
	reasonCode: string
	comment?: string | null
	actorUserId: string
	evidenceSnapshot: Record<string, unknown>
}) {
	const cases = await db
		.select()
		.from(ComplianceCase)
		.where(eq(ComplianceCase.id, input.caseId))
		.limit(1)
	const current = cases[0]
	if (!current) throw commandError("case_not_found", 404)
	if (!current.policyVersionId) throw commandError("case_policy_version_missing", 409)
	if (Number(current.version) !== input.expectedVersion)
		throw commandError("case_version_conflict", 409)
	if (!["open", "in_review", "waiting_information", "blocked"].includes(current.status))
		throw commandError("case_not_actionable", 409)

	const reasons = await db
		.select()
		.from(ComplianceDecisionReason)
		.where(
			and(
				eq(ComplianceDecisionReason.policyVersionId, current.policyVersionId),
				eq(ComplianceDecisionReason.code, input.reasonCode),
				eq(ComplianceDecisionReason.decision, input.decision),
				eq(ComplianceDecisionReason.active, true),
				or(
					isNull(ComplianceDecisionReason.domain),
					eq(ComplianceDecisionReason.domain, current.domain)
				)
			)
		)
		.limit(1)
	const reason = reasons[0]
	if (!reason) throw commandError("decision_reason_not_allowed", 422)
	if (reason.requiresComment && !String(input.comment ?? "").trim())
		throw commandError("decision_comment_required", 422)

	const requiresSecondControl = current.riskTier === "high"
	const now = new Date()
	const decisionId = crypto.randomUUID()
	const nextVersion = input.expectedVersion + 1
	await db.transaction(async (tx) => {
		const claimed = await tx
			.update(ComplianceCase)
			.set({ status: "in_review", stage: "decision", version: nextVersion, updatedAt: now })
			.where(
				and(eq(ComplianceCase.id, input.caseId), eq(ComplianceCase.version, input.expectedVersion))
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed[0]) throw commandError("case_version_conflict", 409)
		await tx.insert(CaseDecision).values({
			id: decisionId,
			caseId: input.caseId,
			decision: input.decision,
			reasonCodeId: reason.id,
			policyVersionId: current.policyVersionId!,
			caseVersion: input.expectedVersion,
			comment: String(input.comment ?? "").trim() || undefined,
			status: requiresSecondControl ? "pending_approval" : "proposed",
			proposedByUserId: input.actorUserId,
			proposedAt: now,
			evidenceSnapshotJson: input.evidenceSnapshot,
			impactSnapshotJson: {
				domain: current.domain,
				requiresSecondControl,
				applicationPending: true,
			},
			createdAt: now,
			updatedAt: now,
		})
		await tx.insert(CaseActivityEvent).values({
			id: crypto.randomUUID(),
			caseId: input.caseId,
			eventType: "decision_proposed",
			actorUserId: input.actorUserId,
			summary: requiresSecondControl
				? "Decisión propuesta y enviada a segundo control"
				: "Decisión propuesta; aplicación pendiente",
			metadataJson: { decisionId, reasonCode: input.reasonCode, decision: input.decision },
			createdAt: now,
		})
		await tx.insert(DomainEventOutbox).values({
			id: crypto.randomUUID(),
			eventType: "case.decision.proposed",
			aggregateType: "ComplianceCase",
			aggregateId: input.caseId,
			dedupeKey: `case.decision.proposed:${decisionId}`,
			payloadJson: { caseId: input.caseId, decisionId, caseVersion: nextVersion },
			status: "pending",
			attempts: 0,
			availableAt: now,
			createdAt: now,
		})
	})
	return { decisionId, caseVersion: nextVersion, requiresSecondControl }
}

export async function assignCase(input: {
	caseId: string
	expectedVersion: number
	assigneeUserId: string
	assigneeEmail: string
	actorUserId: string
}) {
	const now = new Date()
	const nextVersion = input.expectedVersion + 1
	await db.transaction(async (tx) => {
		const claimed = await tx
			.update(ComplianceCase)
			.set({ status: "in_review", version: nextVersion, updatedAt: now })
			.where(
				and(
					eq(ComplianceCase.id, input.caseId),
					eq(ComplianceCase.version, input.expectedVersion),
					inArray(ComplianceCase.status, ["open", "in_review", "waiting_information", "blocked"])
				)
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed[0]) throw commandError("case_version_conflict", 409)
		const tasks = await tx
			.select({ id: CaseTask.id, assigneeEmail: CaseTask.assigneeEmail })
			.from(CaseTask)
			.where(
				and(
					eq(CaseTask.caseId, input.caseId),
					inArray(CaseTask.status, ["open", "in_progress", "blocked"])
				)
			)
		for (const task of tasks) {
			await tx
				.update(CaseTask)
				.set({
					assigneeUserId: input.assigneeUserId,
					assigneeEmail: input.assigneeEmail,
					status: task.assigneeEmail ? "in_progress" : "open",
					version: nextVersion,
					updatedAt: now,
				})
				.where(eq(CaseTask.id, task.id))
			await tx.insert(CaseAssignmentEvent).values({
				id: crypto.randomUUID(),
				caseId: input.caseId,
				taskId: task.id,
				eventType: task.assigneeEmail ? "reassigned" : "assigned",
				fromAssigneeEmail: task.assigneeEmail ?? undefined,
				toAssigneeEmail: input.assigneeEmail,
				actorUserId: input.actorUserId,
				createdAt: now,
			})
		}
		await tx.insert(CaseActivityEvent).values({
			id: crypto.randomUUID(),
			caseId: input.caseId,
			eventType: "case_assigned",
			actorUserId: input.actorUserId,
			summary: `Caso asignado a ${input.assigneeEmail}`,
			metadataJson: { assigneeUserId: input.assigneeUserId },
			createdAt: now,
		})
	})
	return { caseVersion: nextVersion }
}

async function applyCanonicalDomainDecision(params: {
	caseRow: typeof ComplianceCase.$inferSelect
	decision: string
	comment: string | null
	actorUserId: string
}) {
	const { caseRow, decision, comment, actorUserId } = params
	if (caseRow.domain === "verification") {
		if (!["approved", "rejected"].includes(decision)) return { deferred: true }
		const before = await getLatestProviderVerificationStatus(caseRow.providerId)
		await setProviderVerificationV2(
			{ repo: providerV2Repository },
			{
				providerId: caseRow.providerId,
				status: decision,
				reason: comment,
				reviewedByUserId: actorUserId,
				metadataJson: null,
			}
		)
		await writeProviderAuditLog({
			providerId: caseRow.providerId,
			actorUserId,
			action: "provider.verification.review",
			entityType: "ProviderVerification",
			entityId: caseRow.providerId,
			beforeJson: { status: before?.status ?? "pending" },
			afterJson: { status: decision, reason: comment },
			riskLevel: "high",
		})
		await completeComplianceAssignment({
			providerId: caseRow.providerId,
			domain: "verification",
			entityId: caseRow.sourceRef,
		})
	} else if (caseRow.domain === "fiscal") {
		if (decision === "request_information") return { deferred: true }
		await reviewProviderTaxConfiguration({
			providerId: caseRow.providerId,
			actorUserId,
			status: decision === "approved" ? "verified" : "requires_attention",
			reason: comment ?? undefined,
		})
	} else if (caseRow.domain === "documents") {
		if (!["approved", "rejected"].includes(decision)) return { deferred: true }
		await reviewProviderDocument({
			providerId: caseRow.providerId,
			actorUserId,
			documentId: caseRow.sourceRef,
			status: decision === "approved" ? "verified" : "rejected",
			reviewNotes: comment ?? undefined,
		})
	} else if (caseRow.domain === "payments") {
		if (decision === "request_information") return { deferred: true }
		await reviewProviderPaymentAccount({
			providerId: caseRow.providerId,
			actorUserId,
			accountId: caseRow.sourceRef,
			status: decision === "approved" ? "verified" : "requires_attention",
			reason: comment ?? undefined,
		})
	}
	await invalidateProvider(caseRow.providerId)
	await invalidateProviderGovernance(caseRow.providerId, "casework_decision_applied")
	return { deferred: false }
}

const SAVED_VIEW_FILTER_KEYS = new Set(["q", "domain", "status", "priority", "riskTier", "sla"])

export async function saveCaseView(input: {
	ownerUserId: string
	name: string
	filters: Record<string, string>
}) {
	const name = input.name.trim().slice(0, 80)
	if (name.length < 2) throw commandError("saved_view_name_invalid", 422)
	const filters = Object.fromEntries(
		Object.entries(input.filters)
			.filter(([key, value]) => SAVED_VIEW_FILTER_KEYS.has(key) && String(value).trim())
			.map(([key, value]) => [key, String(value).trim().slice(0, 100)])
	)
	const now = new Date()
	const rows = await db
		.insert(SavedCaseView)
		.values({
			id: crypto.randomUUID(),
			ownerUserId: input.ownerUserId,
			name,
			scope: "private",
			filtersJson: filters,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [SavedCaseView.ownerUserId, SavedCaseView.name],
			set: { filtersJson: filters, updatedAt: now },
		})
		.returning()
	return rows[0]
}

export async function deleteCaseView(input: { id: string; ownerUserId: string }) {
	const rows = await db
		.delete(SavedCaseView)
		.where(and(eq(SavedCaseView.id, input.id), eq(SavedCaseView.ownerUserId, input.ownerUserId)))
		.returning({ id: SavedCaseView.id })
	if (!rows[0]) throw commandError("saved_view_not_found", 404)
	return rows[0]
}

/**
 * Applies a persisted proposal through the existing canonical domain service.
 * Case state uses CAS around the external/domain effect; failures remain visible
 * and retryable instead of being silently reported as completed.
 */
export async function applyCaseDecision(input: {
	decisionId: string
	expectedCaseVersion: number
	actorUserId: string
}) {
	const decisions = await db
		.select()
		.from(CaseDecision)
		.where(eq(CaseDecision.id, input.decisionId))
		.limit(1)
	const decision = decisions[0]
	if (!decision) throw commandError("case_decision_not_found", 404)
	if (decision.status === "pending_approval") throw commandError("second_control_required", 409)
	if (decision.status === "applied")
		return { caseVersion: input.expectedCaseVersion, applied: true, replayed: true }
	if (
		decision.status !== "proposed" &&
		decision.status !== "approved" &&
		decision.status !== "failed"
	)
		throw commandError("case_decision_not_actionable", 409)
	const cases = await db
		.select()
		.from(ComplianceCase)
		.where(eq(ComplianceCase.id, decision.caseId))
		.limit(1)
	const caseRow = cases[0]
	if (!caseRow) throw commandError("case_not_found", 404)
	if (Number(caseRow.version) !== input.expectedCaseVersion)
		throw commandError("case_version_conflict", 409)

	const applyingVersion = input.expectedCaseVersion + 1
	await db.transaction(async (tx) => {
		const claimed = await tx
			.update(ComplianceCase)
			.set({
				status: "in_review",
				stage: "decision",
				version: applyingVersion,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(ComplianceCase.id, caseRow.id),
					eq(ComplianceCase.version, input.expectedCaseVersion)
				)
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed[0]) throw commandError("case_version_conflict", 409)
		await tx
			.update(CaseDecision)
			.set({ status: "applying", updatedAt: new Date() })
			.where(eq(CaseDecision.id, decision.id))
	})

	try {
		const domainResult = await applyCanonicalDomainDecision({
			caseRow,
			decision: decision.decision,
			comment: decision.comment,
			actorUserId: input.actorUserId,
		})
		const now = new Date()
		const finalVersion = applyingVersion + 1
		await db.transaction(async (tx) => {
			const updated = await tx
				.update(ComplianceCase)
				.set({
					status: domainResult.deferred ? "waiting_information" : "resolved",
					stage: domainResult.deferred ? "evidence" : "decision",
					resolutionCode: domainResult.deferred ? undefined : decision.decision,
					resolvedAt: domainResult.deferred ? undefined : now,
					version: finalVersion,
					updatedAt: now,
				})
				.where(and(eq(ComplianceCase.id, caseRow.id), eq(ComplianceCase.version, applyingVersion)))
				.returning({ id: ComplianceCase.id })
			if (!updated[0]) throw commandError("case_version_conflict", 409)
			if (!domainResult.deferred) {
				await tx
					.update(CaseTask)
					.set({ status: "completed", completedAt: now, updatedAt: now })
					.where(
						and(
							eq(CaseTask.caseId, caseRow.id),
							inArray(CaseTask.status, ["open", "in_progress", "blocked"])
						)
					)
				await tx
					.update(CaseSlaTimer)
					.set({ status: "stopped", stoppedAt: now, updatedAt: now })
					.where(
						and(
							eq(CaseSlaTimer.caseId, caseRow.id),
							inArray(CaseSlaTimer.status, ["running", "paused", "breached"])
						)
					)
			}
			await tx
				.update(CaseDecision)
				.set({
					status: domainResult.deferred ? "proposed" : "applied",
					appliedAt: domainResult.deferred ? undefined : now,
					updatedAt: now,
				})
				.where(eq(CaseDecision.id, decision.id))
			await tx
				.insert(CaseActivityEvent)
				.values({
					id: crypto.randomUUID(),
					caseId: caseRow.id,
					eventType: domainResult.deferred ? "information_requested" : "decision_applied",
					actorUserId: input.actorUserId,
					summary: domainResult.deferred
						? "La decisión requiere información antes de aplicarse"
						: "Decisión aplicada a la fuente canónica",
					metadataJson: { decisionId: decision.id, decision: decision.decision },
					createdAt: now,
				})
			await tx
				.insert(DomainEventOutbox)
				.values({
					id: crypto.randomUUID(),
					eventType: domainResult.deferred ? "case.waiting_information" : "case.decision.applied",
					aggregateType: "ComplianceCase",
					aggregateId: caseRow.id,
					dedupeKey: `case.decision.${domainResult.deferred ? "deferred" : "applied"}:${decision.id}`,
					payloadJson: { caseId: caseRow.id, decisionId: decision.id, caseVersion: finalVersion },
					status: "pending",
					attempts: 0,
					availableAt: now,
					createdAt: now,
				})
		})
		return { caseVersion: finalVersion, applied: !domainResult.deferred, replayed: false }
	} catch (error) {
		await db.transaction(async (tx) => {
			await tx
				.update(CaseDecision)
				.set({ status: "failed", updatedAt: new Date() })
				.where(eq(CaseDecision.id, decision.id))
			await tx
				.insert(CaseActivityEvent)
				.values({
					id: crypto.randomUUID(),
					caseId: caseRow.id,
					eventType: "decision_failed",
					actorUserId: input.actorUserId,
					summary: "La decisión no pudo aplicarse; requiere revisión",
					metadataJson: {
						decisionId: decision.id,
						errorCode: error instanceof Error ? error.message : "unknown",
					},
					createdAt: new Date(),
				})
		})
		throw error
	}
}

export async function approveAndApplyCaseDecision(input: {
	decisionId: string
	expectedCaseVersion: number
	actorUserId: string
	reason?: string | null
}) {
	const decisions = await db
		.select()
		.from(CaseDecision)
		.where(eq(CaseDecision.id, input.decisionId))
		.limit(1)
	const decision = decisions[0]
	if (!decision) throw commandError("case_decision_not_found", 404)
	if (decision.status !== "pending_approval")
		throw commandError("case_decision_not_pending_approval", 409)
	if (decision.proposedByUserId === input.actorUserId)
		throw commandError("maker_checker_separation_required", 409)
	const now = new Date()
	const approvedVersion = input.expectedCaseVersion + 1
	await db.transaction(async (tx) => {
		const claimed = await tx
			.update(ComplianceCase)
			.set({ version: approvedVersion, updatedAt: now })
			.where(
				and(
					eq(ComplianceCase.id, decision.caseId),
					eq(ComplianceCase.version, input.expectedCaseVersion)
				)
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed[0]) throw commandError("case_version_conflict", 409)
		await tx
			.insert(CaseDecisionApproval)
			.values({
				id: crypto.randomUUID(),
				decisionId: decision.id,
				actorUserId: input.actorUserId,
				vote: "approved",
				reason: String(input.reason ?? "").trim() || undefined,
				createdAt: now,
			})
		await tx
			.update(CaseDecision)
			.set({ status: "approved", updatedAt: now })
			.where(eq(CaseDecision.id, decision.id))
		await tx
			.insert(CaseActivityEvent)
			.values({
				id: crypto.randomUUID(),
				caseId: decision.caseId,
				eventType: "decision_approved",
				actorUserId: input.actorUserId,
				summary: "Segundo control aprobado",
				metadataJson: { decisionId: decision.id },
				createdAt: now,
			})
	})
	return applyCaseDecision({
		decisionId: decision.id,
		expectedCaseVersion: approvedVersion,
		actorUserId: input.actorUserId,
	})
}

export async function rejectCaseDecisionApproval(input: {
	decisionId: string
	expectedCaseVersion: number
	actorUserId: string
	reason: string
}) {
	const reason = input.reason.trim()
	if (reason.length < 8) throw commandError("second_control_reason_required", 422)
	const decisions = await db
		.select()
		.from(CaseDecision)
		.where(eq(CaseDecision.id, input.decisionId))
		.limit(1)
	const decision = decisions[0]
	if (!decision) throw commandError("case_decision_not_found", 404)
	if (decision.status !== "pending_approval")
		throw commandError("case_decision_not_pending_approval", 409)
	if (decision.proposedByUserId === input.actorUserId)
		throw commandError("maker_checker_separation_required", 409)
	const now = new Date()
	const nextVersion = input.expectedCaseVersion + 1
	await db.transaction(async (tx) => {
		const claimed = await tx
			.update(ComplianceCase)
			.set({ status: "in_review", stage: "evidence", version: nextVersion, updatedAt: now })
			.where(
				and(
					eq(ComplianceCase.id, decision.caseId),
					eq(ComplianceCase.version, input.expectedCaseVersion)
				)
			)
			.returning({ id: ComplianceCase.id })
		if (!claimed[0]) throw commandError("case_version_conflict", 409)
		await tx
			.insert(CaseDecisionApproval)
			.values({
				id: crypto.randomUUID(),
				decisionId: decision.id,
				actorUserId: input.actorUserId,
				vote: "rejected",
				reason,
				createdAt: now,
			})
		await tx
			.update(CaseDecision)
			.set({ status: "rejected", updatedAt: now })
			.where(eq(CaseDecision.id, decision.id))
		await tx
			.insert(CaseActivityEvent)
			.values({
				id: crypto.randomUUID(),
				caseId: decision.caseId,
				eventType: "decision_rejected_by_checker",
				actorUserId: input.actorUserId,
				summary: "Segundo control devolvió la propuesta",
				metadataJson: { decisionId: decision.id, reason },
				createdAt: now,
			})
		await tx
			.insert(DomainEventOutbox)
			.values({
				id: crypto.randomUUID(),
				eventType: "case.decision.rejected_by_checker",
				aggregateType: "ComplianceCase",
				aggregateId: decision.caseId,
				dedupeKey: `case.decision.rejected_by_checker:${decision.id}`,
				payloadJson: { caseId: decision.caseId, decisionId: decision.id, caseVersion: nextVersion },
				status: "pending",
				attempts: 0,
				availableAt: now,
				createdAt: now,
			})
	})
	return { caseVersion: nextVersion, rejected: true }
}
