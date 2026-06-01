import { randomUUID } from "crypto"
import {
	db,
	eq,
	Policy,
	PolicyGroup,
	PolicyRule,
	CancellationTier,
	PolicyAuditLog,
	and,
	sql,
} from "astro:db"
import type { PolicyCategory } from "../../domain/policy.category"
import type {
	PolicyCommandRepositoryPortCapa6,
	CancellationTierInput,
	PolicyLibraryStatus,
	PolicyProfessionalMetadata,
} from "../../application/ports/PolicyCommandRepositoryPortCapa6"

export class PolicyCommandRepositoryCapa6 implements PolicyCommandRepositoryPortCapa6 {
	async getPolicyById(policyId: string) {
		const row = await db.select().from(Policy).where(eq(Policy.id, policyId)).get()
		if (!row) return null

		const grp = await this.getPolicyGroupById(row.groupId)
		if (!grp) return null

		return {
			id: String(row.id),
			groupId: String(row.groupId),
			category: grp.category,
			status: String((row as any).status),
			version: Number((row as any).version),
			policyPresetKey:
				(row as any).policyPresetKey == null ? null : String((row as any).policyPresetKey),
			stayLengthType:
				(row as any).stayLengthType == null ? null : String((row as any).stayLengthType),
			gracePeriod: (row as any).gracePeriod == null ? null : Number((row as any).gracePeriod),
			refundBasis: (row as any).refundBasis == null ? null : String((row as any).refundBasis),
			payoutBasis: (row as any).payoutBasis == null ? null : String((row as any).payoutBasis),
			localTimezone: (row as any).localTimezone == null ? null : String((row as any).localTimezone),
			legalOverrideFlags: ((row as any).legalOverrideFlags ?? null) as Record<
				string,
				boolean
			> | null,
			effectiveFrom: row.effectiveFrom == null ? null : String(row.effectiveFrom),
			effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo),
		}
	}

	async getPolicyGroupById(groupId: string) {
		const row = await db.select().from(PolicyGroup).where(eq(PolicyGroup.id, groupId)).get()
		if (!row) return null
		return {
			id: String(row.id),
			category: String((row as any).category) as PolicyCategory,
			ownerProviderId:
				(row as any).ownerProviderId == null ? null : String((row as any).ownerProviderId),
		}
	}

	async getMaxPolicyVersionByGroupId(groupId: string): Promise<number> {
		const id = String(groupId ?? "").trim()
		if (!id) return 0
		const row = await db
			.select({ maxV: sql<number>`max(${Policy.version})` })
			.from(Policy)
			.where(eq(Policy.groupId, id))
			.get()
		const v = Number((row as any)?.maxV ?? 0)
		return Number.isFinite(v) ? v : 0
	}

	async createPolicyGroup(params: { category: PolicyCategory; ownerProviderId?: string | null }) {
		const groupId = randomUUID()
		await db.insert(PolicyGroup).values({
			id: groupId,
			category: params.category,
			ownerProviderId: params.ownerProviderId ?? null,
		} as any)
		return { groupId }
	}

	async createPolicyVersion(params: {
		groupId: string
		description: string
		version: number
		status: PolicyLibraryStatus
		effectiveFromIso?: string | null
		effectiveToIso?: string | null
		metadata?: PolicyProfessionalMetadata
	}) {
		const policyId = randomUUID()
		await db.insert(Policy).values({
			id: policyId,
			groupId: params.groupId,
			description: params.description ?? "",
			version: params.version,
			status: params.status,
			policyPresetKey: params.metadata?.policyPresetKey ?? null,
			stayLengthType: params.metadata?.stayLengthType ?? null,
			gracePeriod: params.metadata?.gracePeriod ?? null,
			refundBasis: params.metadata?.refundBasis ?? null,
			payoutBasis: params.metadata?.payoutBasis ?? null,
			localTimezone: params.metadata?.localTimezone ?? null,
			legalOverrideFlags: params.metadata?.legalOverrideFlags ?? null,
			effectiveFrom: params.effectiveFromIso ?? null,
			effectiveTo: params.effectiveToIso ?? null,
		} as any)
		return { policyId }
	}

	async updatePolicyStatus(params: { policyId: string; status: PolicyLibraryStatus }) {
		await db
			.update(Policy)
			.set({ status: params.status } as any)
			.where(eq(Policy.id, params.policyId))
		return { policyId: params.policyId, status: params.status }
	}

	async replacePolicyRules(params: {
		policyId: string
		rules: Array<{ ruleKey: string; ruleValue: unknown }>
	}) {
		await db.transaction(async (tx) => {
			await tx.delete(PolicyRule).where(eq(PolicyRule.policyId, params.policyId))
			if (!params.rules.length) return
			for (const r of params.rules) {
				await tx.insert(PolicyRule).values({
					id: randomUUID(),
					policyId: params.policyId,
					ruleKey: r.ruleKey,
					ruleValue: r.ruleValue as any,
				} as any)
			}
		})
	}

	async replaceCancellationTiers(params: { policyId: string; tiers: CancellationTierInput[] }) {
		await db.transaction(async (tx) => {
			await tx.delete(CancellationTier).where(eq(CancellationTier.policyId, params.policyId))
			for (const t of params.tiers) {
				await tx.insert(CancellationTier).values({
					id: randomUUID(),
					policyId: params.policyId,
					daysBeforeArrival: Number(t.daysBeforeArrival),
					penaltyType: t.penaltyType,
					penaltyAmount: Number(t.penaltyAmount),
				} as any)
			}
		})
	}

	async listActivePoliciesByGroupId(groupId: string) {
		const id = String(groupId ?? "").trim()
		if (!id) return []
		const rows = await db
			.select({
				id: Policy.id,
				version: Policy.version,
				effectiveFrom: Policy.effectiveFrom,
				effectiveTo: Policy.effectiveTo,
			})
			.from(Policy)
			.where(and(eq(Policy.groupId, id), eq(Policy.status, "active")))
			.all()
		return rows.map((row) => ({
			id: String(row.id),
			version: Number(row.version ?? 0),
			effectiveFrom: row.effectiveFrom == null ? null : String(row.effectiveFrom),
			effectiveTo: row.effectiveTo == null ? null : String(row.effectiveTo),
		}))
	}

	async createAuditLog(params: {
		eventType:
			| "policy_version_created"
			| "assignment_replaced"
			| "policy_published"
			| "policy_archived"
		actorUserId?: string | null
		policyId?: string | null
		policyGroupId?: string | null
		assignmentId?: string | null
		scope?: string | null
		scopeId?: string | null
		channel?: string | null
		before?: unknown
		after?: unknown
	}) {
		await db.insert(PolicyAuditLog).values({
			id: randomUUID(),
			eventType: params.eventType,
			actorUserId: params.actorUserId ?? null,
			policyId: params.policyId ?? null,
			policyGroupId: params.policyGroupId ?? null,
			assignmentId: params.assignmentId ?? null,
			scope: params.scope ?? null,
			scopeId: params.scopeId ?? null,
			channel: params.channel ?? null,
			beforeJson: params.before ?? null,
			afterJson: params.after ?? null,
		} as any)
	}
}
