import { randomUUID } from "node:crypto"
import type { APIRoute } from "astro"
import {
	db,
	and,
	eq,
	inArray,
	isNull,
	sql,
	Policy,
	PolicyAssignment,
	PolicyAuditLog,
	PolicyGroup,
} from "astro:db"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOrCreateProviderPresetPolicy } from "@/lib/policies/getOrCreateProviderPresetPolicy"
import { getOwnedPolicyScopeIds } from "@/lib/policies/policyOwnership"
import {
	isCanonicalPolicyEffectiveDate,
	planPolicyDateAssignmentRangeChange,
} from "@/modules/policies/public"

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
	})
}

function text(value: unknown) {
	return String(value ?? "").trim()
}

export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProvider(request)
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
	if (!body) return json(400, { error: "Solicitud inválida." })

	const ratePlanIds = Array.isArray(body.ratePlanIds)
		? [...new Set(body.ratePlanIds.map(text).filter(Boolean))]
		: []
	const effectiveFrom = text(body.effectiveFrom)
	const effectiveTo = text(body.effectiveTo)
	const channel = text(body.channel) || null
	const mode = text(body.mode) || "existing"

	if (
		!ratePlanIds.length ||
		!isCanonicalPolicyEffectiveDate(effectiveFrom) ||
		!isCanonicalPolicyEffectiveDate(effectiveTo) ||
		effectiveFrom > effectiveTo
	) {
		return json(400, { error: "Selecciona tarifas y un rango de fechas válido." })
	}

	const owned = await getOwnedPolicyScopeIds(providerId)
	if (ratePlanIds.some((id) => !owned.ratePlanIds.includes(id))) {
		return json(403, { error: "Una de las tarifas no pertenece al proveedor." })
	}

	let policyId = text(body.policyId)
	let policyGroupId = ""
	if (mode === "preset") {
		const policyPresetKey = text(body.policyPresetKey)
		if (!policyPresetKey) return json(400, { error: "Selecciona una plantilla." })
		const presetPolicy = await getOrCreateProviderPresetPolicy({
			providerId,
			actorUserId: String(user.id),
			category: "Cancellation",
			policyPresetKey,
		})
		policyId = presetPolicy.policyId
		policyGroupId = presetPolicy.groupId
	} else if (mode === "existing") {
		const policy = await db
			.select({ id: Policy.id, groupId: Policy.groupId })
			.from(Policy)
			.innerJoin(PolicyGroup, eq(PolicyGroup.id, Policy.groupId))
			.where(
				and(
					eq(Policy.id, policyId),
					eq(Policy.status, "active"),
					eq(PolicyGroup.category, "Cancellation"),
					eq(PolicyGroup.ownerProviderId, providerId)
				)
			)
			.get()
		if (!policy) return json(404, { error: "La condición de cancelación no está disponible." })
		policyGroupId = String(policy.groupId)
	} else if (mode !== "base") {
		return json(400, { error: "Origen de condición inválido." })
	}

	const createdAt = new Date()
	const assignments: string[] = []
	let replacedAssignments = 0
	let preservedSegments = 0
	await db.transaction(async (tx) => {
		for (let index = 0; index < ratePlanIds.length; index += 1) {
			const ratePlanId = ratePlanIds[index]
			const channelCondition =
				channel == null ? isNull(PolicyAssignment.channel) : eq(PolicyAssignment.channel, channel)
			const existing = await tx
				.select({
					id: PolicyAssignment.id,
					policyGroupId: PolicyAssignment.policyGroupId,
					effectiveFrom: PolicyAssignment.effectiveFrom,
					effectiveTo: PolicyAssignment.effectiveTo,
					createdAt: PolicyAssignment.createdAt,
				})
				.from(PolicyAssignment)
				.where(
					and(
						eq(PolicyAssignment.isActive, true),
						eq(PolicyAssignment.category, "Cancellation"),
						eq(PolicyAssignment.scope, "rate_plan"),
						eq(PolicyAssignment.scopeId, ratePlanId),
						channelCondition,
						sql`${PolicyAssignment.effectiveFrom} IS NOT NULL`,
						sql`${PolicyAssignment.effectiveTo} IS NOT NULL`,
						sql`${PolicyAssignment.effectiveFrom} <= ${effectiveTo}`,
						sql`${PolicyAssignment.effectiveTo} >= ${effectiveFrom}`
					)
				)
				.all()

			const plan = planPolicyDateAssignmentRangeChange({
				existing: existing.map((assignment) => ({
					id: String(assignment.id),
					policyGroupId: String(assignment.policyGroupId),
					effectiveFrom: String(assignment.effectiveFrom),
					effectiveTo: String(assignment.effectiveTo),
					createdAt:
						assignment.createdAt instanceof Date
							? assignment.createdAt
							: new Date(assignment.createdAt),
				})),
				effectiveFrom,
				effectiveTo,
				replacementPolicyGroupId: mode === "base" ? null : policyGroupId,
			})

			if (plan.deactivateIds.length) {
				await tx
					.update(PolicyAssignment)
					.set({ isActive: false })
					.where(inArray(PolicyAssignment.id, plan.deactivateIds))
				replacedAssignments += plan.deactivateIds.length
			}

			const segmentIds: string[] = []
			for (const segment of plan.preservedSegments) {
				const segmentId = randomUUID()
				await tx.insert(PolicyAssignment).values({
					id: segmentId,
					policyGroupId: segment.policyGroupId,
					category: "Cancellation",
					scope: "rate_plan",
					scopeId: ratePlanId,
					channel,
					effectiveFrom: segment.effectiveFrom,
					effectiveTo: segment.effectiveTo,
					isActive: true,
					createdAt: segment.createdAt,
				})
				segmentIds.push(segmentId)
				preservedSegments += 1
			}

			let assignmentId: string | null = null
			if (plan.replacement) {
				assignmentId = randomUUID()
				await tx.insert(PolicyAssignment).values({
					id: assignmentId,
					policyGroupId: plan.replacement.policyGroupId,
					category: "Cancellation",
					scope: "rate_plan",
					scopeId: ratePlanId,
					channel,
					effectiveFrom: plan.replacement.effectiveFrom,
					effectiveTo: plan.replacement.effectiveTo,
					isActive: true,
					createdAt: new Date(createdAt.getTime() + index),
				})
				assignments.push(assignmentId)
			}

			await tx.insert(PolicyAuditLog).values({
				id: randomUUID(),
				eventType:
					mode === "base"
						? "cancellation_date_assignment_restored"
						: "cancellation_date_assignment_replaced",
				actorUserId: String(user.id),
				policyId: policyId || null,
				policyGroupId: plan.replacement?.policyGroupId ?? null,
				assignmentId,
				scope: "rate_plan",
				scopeId: ratePlanId,
				channel,
				beforeJson: existing.map((assignment) => ({
					assignmentId: String(assignment.id),
					policyGroupId: String(assignment.policyGroupId),
					effectiveFrom: String(assignment.effectiveFrom),
					effectiveTo: String(assignment.effectiveTo),
				})),
				afterJson: {
					effectiveFrom,
					effectiveTo,
					mode,
					assignmentId,
					preservedSegmentIds: segmentIds,
				},
				createdAt: new Date(createdAt.getTime() + index),
			})
		}
	})

	return json(200, {
		success: true,
		assignmentIds: assignments,
		affectedRatePlans: ratePlanIds.length,
		replacedAssignments,
		preservedSegments,
		restoredBase: mode === "base",
		effectiveFrom,
		effectiveTo,
	})
}
