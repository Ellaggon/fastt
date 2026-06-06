import type { APIRoute } from "astro"
import {
	CancellationTier,
	db,
	eq,
	inArray,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	PolicyRule,
} from "astro:db"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOwnedPolicyGroupIds } from "@/lib/policies/policyOwnership"

export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const ownedGroupIds = await getOwnedPolicyGroupIds(providerId, { activeOnly: false })
	if (!ownedGroupIds.length) return Response.json([])

	const policyRows = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			category: PolicyGroup.category,
			description: Policy.description,
			version: Policy.version,
			status: Policy.status,
			policyPresetKey: (Policy as any).policyPresetKey,
			stayLengthType: (Policy as any).stayLengthType,
			gracePeriod: (Policy as any).gracePeriod,
			refundBasis: (Policy as any).refundBasis,
			payoutBasis: (Policy as any).payoutBasis,
			localTimezone: (Policy as any).localTimezone,
			legalOverrideFlags: (Policy as any).legalOverrideFlags,
			effectiveFrom: Policy.effectiveFrom,
			effectiveTo: Policy.effectiveTo,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(inArray(Policy.groupId, ownedGroupIds))

	const policyIds = policyRows.map((row) => String(row.id)).filter(Boolean)
	const [rules, tiers, assignments] = await Promise.all([
		policyIds.length
			? db.select().from(PolicyRule).where(inArray(PolicyRule.policyId, policyIds)).all()
			: Promise.resolve([]),
		policyIds.length
			? db
					.select()
					.from(CancellationTier)
					.where(inArray(CancellationTier.policyId, policyIds))
					.all()
			: Promise.resolve([]),
		db
			.select({
				id: PolicyAssignment.id,
				policyGroupId: PolicyAssignment.policyGroupId,
				category: PolicyAssignment.category,
				scope: PolicyAssignment.scope,
				scopeId: PolicyAssignment.scopeId,
				channel: PolicyAssignment.channel,
				isActive: PolicyAssignment.isActive,
			})
			.from(PolicyAssignment)
			.where(inArray(PolicyAssignment.policyGroupId, ownedGroupIds))
			.all(),
	])

	const rulesByPolicyId = new Map<string, any[]>()
	for (const rule of rules as any[]) {
		const policyId = String(rule.policyId ?? "")
		if (!rulesByPolicyId.has(policyId)) rulesByPolicyId.set(policyId, [])
		rulesByPolicyId.get(policyId)?.push({
			id: String(rule.id),
			policyId,
			ruleKey: rule.ruleKey == null ? null : String(rule.ruleKey),
			ruleValue: rule.ruleValue,
		})
	}

	const tiersByPolicyId = new Map<string, any[]>()
	for (const tier of tiers as any[]) {
		const policyId = String(tier.policyId ?? "")
		if (!tiersByPolicyId.has(policyId)) tiersByPolicyId.set(policyId, [])
		tiersByPolicyId.get(policyId)?.push({
			id: String(tier.id),
			policyId,
			daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
			penaltyType: String(tier.penaltyType ?? ""),
			penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
		})
	}
	for (const list of tiersByPolicyId.values()) {
		list.sort((a, b) => Number(b.daysBeforeArrival) - Number(a.daysBeforeArrival))
	}

	const assignmentsByGroupId = new Map<string, any[]>()
	for (const assignment of assignments as any[]) {
		const groupId = String(assignment.policyGroupId ?? "")
		if (!assignmentsByGroupId.has(groupId)) assignmentsByGroupId.set(groupId, [])
		assignmentsByGroupId.get(groupId)?.push({
			id: String(assignment.id),
			policyGroupId: groupId,
			category: String(assignment.category ?? ""),
			scope: String(assignment.scope ?? ""),
			scopeId: String(assignment.scopeId ?? ""),
			channel: assignment.channel == null ? null : String(assignment.channel),
			isActive: Boolean(assignment.isActive),
		})
	}

	const groups = new Map<string, any>()
	for (const row of policyRows) {
		const groupId = String(row.groupId ?? "")
		if (!groups.has(groupId)) {
			groups.set(groupId, {
				group: {
					id: groupId,
					category: String(row.category ?? ""),
				},
				versions: [],
				assignments: assignmentsByGroupId.get(groupId) ?? [],
			})
		}
		groups.get(groupId).versions.push({
			id: String(row.id),
			groupId,
			category: String(row.category ?? ""),
			description: String(row.description ?? ""),
			version: Number(row.version ?? 0),
			status: String(row.status ?? ""),
			policyPresetKey:
				(row as any).policyPresetKey == null ? null : String((row as any).policyPresetKey),
			stayLengthType:
				(row as any).stayLengthType == null ? null : String((row as any).stayLengthType),
			gracePeriod: (row as any).gracePeriod == null ? null : Number((row as any).gracePeriod),
			refundBasis: (row as any).refundBasis == null ? null : String((row as any).refundBasis),
			payoutBasis: (row as any).payoutBasis == null ? null : String((row as any).payoutBasis),
			localTimezone: (row as any).localTimezone == null ? null : String((row as any).localTimezone),
			legalOverrideFlags: (row as any).legalOverrideFlags ?? null,
			effectiveFrom: row.effectiveFrom == null ? null : String(row.effectiveFrom),
			effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo),
			rules: rulesByPolicyId.get(String(row.id)) ?? [],
			tiers: tiersByPolicyId.get(String(row.id)) ?? [],
		})
	}

	const payload = Array.from(groups.values()).map((group) => {
		group.versions.sort((a: any, b: any) => Number(b.version ?? 0) - Number(a.version ?? 0))
		return {
			...group,
			latest: group.versions[0] ?? null,
			activeAssignments: group.assignments.filter((assignment: any) => assignment.isActive),
		}
	})

	payload.sort((a, b) => {
		const categoryCompare = String(a.group.category).localeCompare(String(b.group.category))
		if (categoryCompare !== 0) return categoryCompare
		return String(a.latest?.description ?? "").localeCompare(String(b.latest?.description ?? ""))
	})

	return Response.json(payload)
}
