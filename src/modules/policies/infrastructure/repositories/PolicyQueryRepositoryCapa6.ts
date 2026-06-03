import {
	CancellationTier,
	db,
	eq,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	PolicyRule,
} from "astro:db"

import type {
	PolicyDetailCapa6,
	PolicyQueryRepositoryPortCapa6,
} from "../../application/ports/PolicyQueryRepositoryPortCapa6"
import type { PolicyCategory } from "../../domain/policy.category"
import type { PolicyScope } from "../../domain/policy.scope"
import { ensurePolicySchemaCompatibility } from "@/lib/policies/policySchemaCompat"

export class PolicyQueryRepositoryCapa6 implements PolicyQueryRepositoryPortCapa6 {
	async getPolicyDetailById(policyId: string): Promise<PolicyDetailCapa6 | null> {
		await ensurePolicySchemaCompatibility()
		const id = String(policyId ?? "").trim()
		if (!id) return null

		const row = await db
			.select({
				id: Policy.id,
				groupId: Policy.groupId,
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
				category: PolicyGroup.category,
			})
			.from(Policy)
			.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
			.where(eq(Policy.id, id))
			.get()

		if (!row) return null

		const [rules, tiers, assignments] = await Promise.all([
			db.select().from(PolicyRule).where(eq(PolicyRule.policyId, id)).all(),
			db.select().from(CancellationTier).where(eq(CancellationTier.policyId, id)).all(),
			db
				.select({
					id: PolicyAssignment.id,
					policyGroupId: PolicyAssignment.policyGroupId,
					scope: PolicyAssignment.scope,
					scopeId: PolicyAssignment.scopeId,
					channel: PolicyAssignment.channel,
					isActive: PolicyAssignment.isActive,
				})
				.from(PolicyAssignment)
				.where(eq(PolicyAssignment.policyGroupId, String(row.groupId)))
				.all(),
		])

		return {
			policy: {
				id: String(row.id),
				groupId: String(row.groupId),
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
				localTimezone:
					(row as any).localTimezone == null ? null : String((row as any).localTimezone),
				legalOverrideFlags: ((row as any).legalOverrideFlags ?? null) as Record<
					string,
					boolean
				> | null,
				effectiveFrom: row.effectiveFrom == null ? null : String(row.effectiveFrom),
				effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo),
			},
			group: {
				id: String(row.groupId),
				category: String(row.category ?? "") as PolicyCategory,
			},
			rules: rules.map((rule: any) => ({
				id: String(rule.id),
				policyId: String(rule.policyId),
				ruleKey: rule.ruleKey == null ? null : String(rule.ruleKey),
				ruleValue: rule.ruleValue as unknown,
			})),
			tiers: tiers
				.map((tier: any) => ({
					id: String(tier.id),
					policyId: String(tier.policyId),
					daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
					penaltyType: String(tier.penaltyType ?? ""),
					penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
				}))
				.sort((a, b) => {
					if (a.daysBeforeArrival !== b.daysBeforeArrival) {
						return a.daysBeforeArrival - b.daysBeforeArrival
					}
					return a.id.localeCompare(b.id)
				}),
			assignments: assignments.map((assignment: any) => ({
				id: String(assignment.id),
				policyGroupId: String(assignment.policyGroupId),
				scope: String(assignment.scope) as PolicyScope,
				scopeId: String(assignment.scopeId),
				channel: assignment.channel == null ? null : String(assignment.channel),
				isActive: Boolean(assignment.isActive),
			})),
		}
	}
}
