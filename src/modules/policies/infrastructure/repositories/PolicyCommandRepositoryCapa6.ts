import { randomUUID } from "crypto"
import { db, eq, Policy, PolicyGroup, PolicyRule, CancellationTier, sql } from "astro:db"
import type { PolicyCategory } from "../../domain/policy.category"
import type {
	PolicyCommandRepositoryPortCapa6,
	CancellationTierInput,
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
		}
	}

	async getPolicyGroupById(groupId: string) {
		const row = await db.select().from(PolicyGroup).where(eq(PolicyGroup.id, groupId)).get()
		if (!row) return null
		return { id: String(row.id), category: String((row as any).category) as PolicyCategory }
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

	async createPolicyGroup(params: { category: PolicyCategory }) {
		const groupId = randomUUID()
		await db.insert(PolicyGroup).values({ id: groupId, category: params.category } as any)
		return { groupId }
	}

	async createPolicyVersion(params: {
		groupId: string
		description: string
		version: number
		status: "active"
		effectiveFromIso?: string | null
		effectiveToIso?: string | null
	}) {
		const policyId = randomUUID()
		await db.insert(Policy).values({
			id: policyId,
			groupId: params.groupId,
			description: params.description ?? "",
			version: params.version,
			status: params.status,
			effectiveFrom: params.effectiveFromIso ?? null,
			effectiveTo: params.effectiveToIso ?? null,
		} as any)
		return { policyId }
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
}
