import {
	db,
	and,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
	Policy,
	PolicyAssignment,
} from "@/shared/infrastructure/db/compat"
import { getPolicyPresetLabel } from "@/data/policy/policy-presets"

export type CancellationDateAssignment = {
	id: string
	ratePlanId: string
	policyId: string
	label: string
	effectiveFrom: string
	effectiveTo: string
	createdAt: Date
}

export async function loadCancellationDateAssignments(params: {
	ratePlanIds: string[]
	from: string
	to: string
}): Promise<CancellationDateAssignment[]> {
	if (!params.ratePlanIds.length || !params.from || !params.to) return []
	const rows = await db
		.select({
			id: PolicyAssignment.id,
			ratePlanId: PolicyAssignment.scopeId,
			policyGroupId: PolicyAssignment.policyGroupId,
			effectiveFrom: PolicyAssignment.effectiveFrom,
			effectiveTo: PolicyAssignment.effectiveTo,
			createdAt: PolicyAssignment.createdAt,
			policyId: Policy.id,
			description: Policy.description,
			policyPresetKey: Policy.policyPresetKey,
			version: Policy.version,
		})
		.from(PolicyAssignment)
		.innerJoin(Policy, eq(Policy.groupId, PolicyAssignment.policyGroupId))
		.where(
			and(
				eq(PolicyAssignment.scope, "rate_plan"),
				inArray(PolicyAssignment.scopeId, params.ratePlanIds),
				eq(PolicyAssignment.category, "Cancellation"),
				eq(PolicyAssignment.isActive, true),
				isNotNull(PolicyAssignment.effectiveFrom),
				isNotNull(PolicyAssignment.effectiveTo),
				eq(Policy.status, "active"),
				or(eq(PolicyAssignment.channel, "web"), isNull(PolicyAssignment.channel)),
				sql`${PolicyAssignment.effectiveFrom} <= ${params.to}`,
				sql`${PolicyAssignment.effectiveTo} >= ${params.from}`
			)
		)

	const bestPolicyByAssignment = new Map<string, (typeof rows)[number]>()
	for (const row of rows) {
		if (String(row.effectiveFrom) > params.to || String(row.effectiveTo) < params.from) {
			continue
		}
		const current = bestPolicyByAssignment.get(String(row.id))
		if (!current || Number(row.version) > Number(current.version)) {
			bestPolicyByAssignment.set(String(row.id), row)
		}
	}

	return [...bestPolicyByAssignment.values()].map((row) => ({
		id: String(row.id),
		ratePlanId: String(row.ratePlanId),
		policyId: String(row.policyId),
		label:
			getPolicyPresetLabel(String(row.policyPresetKey ?? ""), "Cancellation", "") ||
			String(row.description ?? "").trim() ||
			"Cancelación especial",
		effectiveFrom: String(row.effectiveFrom),
		effectiveTo: String(row.effectiveTo),
		createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
	}))
}
