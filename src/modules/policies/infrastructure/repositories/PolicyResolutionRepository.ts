import {
	db,
	and,
	eq,
	inArray,
	isNull,
	or,
	sql,
	PolicyAssignment,
	PolicyGroup,
	Policy,
	PolicyRule,
	CancellationTier,
} from "astro:db"
import type {
	CancellationTierRow,
	PolicyAssignmentSnapshot,
	PolicyResolutionRepositoryPort,
	PolicyRuleRow,
	PolicySnapshot,
	ScopeNode,
} from "../../application/ports/PolicyResolutionRepositoryPort"

export class PolicyResolutionRepository implements PolicyResolutionRepositoryPort {
	async listActiveAssignments(params: {
		scopeChain: ScopeNode[]
		channels: Array<string | null>
	}): Promise<PolicyAssignmentSnapshot[]> {
		const pairs = params.scopeChain.filter((n) => n.scopeId)
		if (!pairs.length) return []

		const channelConds = params.channels
			.map((c) => (c == null ? isNull(PolicyAssignment.channel) : eq(PolicyAssignment.channel, c)))
			.filter(Boolean)

		// Match exact (scope, scopeId) pairs deterministically.
		const scopeConds = pairs.map((p) =>
			and(eq(PolicyAssignment.scope, p.scope), eq(PolicyAssignment.scopeId, p.scopeId))
		)

		const rows = await db
			.select({
				id: PolicyAssignment.id,
				policyGroupId: PolicyAssignment.policyGroupId,
				scope: PolicyAssignment.scope,
				scopeId: PolicyAssignment.scopeId,
				channel: PolicyAssignment.channel,
				category: PolicyGroup.category,
			})
			.from(PolicyAssignment)
			.innerJoin(PolicyGroup, eq(PolicyAssignment.policyGroupId, PolicyGroup.id))
			.where(and(eq(PolicyAssignment.isActive, true), or(...scopeConds), or(...channelConds)))
			.all()

		return rows.map((r: any) => ({
			id: String(r.id),
			policyGroupId: String(r.policyGroupId),
			category: String(r.category),
			scope: String(r.scope) as any,
			scopeId: String(r.scopeId),
			channel: r.channel == null ? null : String(r.channel),
		}))
	}

	async listActivePoliciesByGroupIds(params: {
		groupIds: string[]
		asOfDate: string
	}): Promise<Record<string, PolicySnapshot>> {
		const groupIds = params.groupIds.filter(Boolean)
		if (!groupIds.length) return {}

		const asOf = String(params.asOfDate ?? "").trim()
		if (!asOf) return {}

		const rows = await db
			.select({
				id: Policy.id,
				groupId: Policy.groupId,
				description: Policy.description,
				version: Policy.version,
				status: Policy.status,
				effectiveFrom: Policy.effectiveFrom,
				effectiveTo: Policy.effectiveTo,
			})
			.from(Policy)
			.where(
				and(
					inArray(Policy.groupId, groupIds),
					eq(Policy.status, "active"),
					or(isNull(Policy.effectiveFrom), sql`${Policy.effectiveFrom} <= ${asOf}`),
					or(isNull(Policy.effectiveTo), sql`${Policy.effectiveTo} >= ${asOf}`)
				)
			)
			.all()

		// Deterministic best per group: highest version wins, tie by policy id.
		rows.sort((a: any, b: any) => {
			if (a.groupId !== b.groupId) return String(a.groupId).localeCompare(String(b.groupId))
			if (Number(a.version) !== Number(b.version)) return Number(b.version) - Number(a.version)
			return String(a.id).localeCompare(String(b.id))
		})

		const out: Record<string, PolicySnapshot> = {}
		for (const r of rows as any[]) {
			const gid = String(r.groupId)
			if (out[gid]) continue
			out[gid] = {
				id: String(r.id),
				groupId: gid,
				description: String(r.description ?? ""),
				version: Number(r.version ?? 0),
				status: "active",
				effectiveFrom: r.effectiveFrom == null ? null : String(r.effectiveFrom),
				effectiveTo: r.effectiveTo == null ? null : String(r.effectiveTo),
			}
		}
		return out
	}

	async listPolicyRulesByPolicyId(policyId: string): Promise<PolicyRuleRow[]> {
		const id = String(policyId ?? "").trim()
		if (!id) return []
		const rows = await db.select().from(PolicyRule).where(eq(PolicyRule.policyId, id)).all()
		return rows.map((r: any) => ({
			id: String(r.id),
			policyId: String(r.policyId),
			ruleKey: r.ruleKey == null ? null : String(r.ruleKey),
			ruleValue: r.ruleValue as unknown,
		}))
	}

	async listCancellationTiersByPolicyId(policyId: string): Promise<CancellationTierRow[]> {
		const id = String(policyId ?? "").trim()
		if (!id) return []
		const rows = await db
			.select()
			.from(CancellationTier)
			.where(eq(CancellationTier.policyId, id))
			.all()
		// Deterministic ordering: closest-to-arrival first.
		rows.sort((a: any, b: any) => {
			if (Number(a.daysBeforeArrival) !== Number(b.daysBeforeArrival))
				return Number(a.daysBeforeArrival) - Number(b.daysBeforeArrival)
			return String(a.id).localeCompare(String(b.id))
		})
		return rows.map((r: any) => ({
			id: String(r.id),
			policyId: String(r.policyId),
			daysBeforeArrival: Number(r.daysBeforeArrival ?? 0),
			penaltyType: String(r.penaltyType ?? ""),
			penaltyAmount: r.penaltyAmount == null ? null : Number(r.penaltyAmount),
		}))
	}
}
