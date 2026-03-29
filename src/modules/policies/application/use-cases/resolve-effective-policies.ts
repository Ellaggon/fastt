import { toISODate } from "@/shared/domain/date/date.utils"
import type { PolicyScope } from "../../domain/policy.scope"
import type {
	CancellationTierRow,
	PolicyResolutionRepositoryPort,
	PolicyRuleRow,
	PolicySnapshot,
	ScopeNode,
} from "../ports/PolicyResolutionRepositoryPort"

export type ScopeContext = {
	productId: string
	variantId?: string
	ratePlanId?: string
	channel?: string
}

export type Policy = PolicySnapshot & {
	rules: PolicyRuleRow[]
	cancellationTiers: CancellationTierRow[]
}

export type ResolvedPolicy = {
	category: string
	policy: Policy
	resolvedFromScope: Exclude<PolicyScope, "global"> | "global"
}

export type ResolveEffectivePoliciesResult = {
	policies: ResolvedPolicy[]
}

function uniq<T>(xs: T[]): T[] {
	return [...new Set(xs)]
}

function buildScopeChain(ctx: ScopeContext): ScopeNode[] {
	const chain: ScopeNode[] = []

	if (ctx.ratePlanId) chain.push({ scope: "rate_plan", scopeId: ctx.ratePlanId })
	if (ctx.variantId) chain.push({ scope: "variant", scopeId: ctx.variantId })
	chain.push({ scope: "product", scopeId: ctx.productId })
	chain.push({ scope: "global", scopeId: "global" })

	return chain
}

export async function resolveEffectivePolicies(
	deps: { repo: PolicyResolutionRepositoryPort },
	ctx: ScopeContext
): Promise<ResolveEffectivePoliciesResult> {
	const productId = String(ctx.productId ?? "").trim()
	if (!productId) return { policies: [] }

	const scopeChain = buildScopeChain({ ...ctx, productId })
	const channels: Array<string | null> = ctx.channel ? [ctx.channel, null] : [null]

	const assignments = await deps.repo.listActiveAssignments({ scopeChain, channels })
	if (!assignments.length) return { policies: [] }

	const categories = uniq(assignments.map((a) => a.category)).sort((a, b) => a.localeCompare(b))
	const asOfDate = toISODate(new Date()) // minimal "as-of" anchor; CAPA 6 can later accept checkIn.

	const resolved: ResolvedPolicy[] = []

	for (const category of categories) {
		let winner: { scope: PolicyScope; policy: PolicySnapshot; assignmentId: string } | null = null

		for (const node of scopeChain) {
			const scoped = assignments.filter(
				(a) => a.category === category && a.scope === node.scope && a.scopeId === node.scopeId
			)
			if (!scoped.length) continue

			// Channel preference: exact match overrides null. If no exact match -> null.
			const preferred = ctx.channel ? scoped.filter((a) => a.channel === ctx.channel) : []
			const channelCandidates = preferred.length
				? preferred
				: scoped.filter((a) => a.channel === null)
			if (!channelCandidates.length) continue

			const groupIds = uniq(channelCandidates.map((a) => a.policyGroupId)).sort()
			const byGroup = await deps.repo.listActivePoliciesByGroupIds({ groupIds, asOfDate })

			const scored = channelCandidates
				.map((a) => ({ a, p: byGroup[a.policyGroupId] }))
				.filter((x): x is { a: (typeof channelCandidates)[number]; p: PolicySnapshot } =>
					Boolean(x.p)
				)

			if (!scored.length) continue

			// Deterministic winner within scope: highest version wins, tie-break by policy id then assignment id.
			scored.sort((x, y) => {
				if (x.p.version !== y.p.version) return y.p.version - x.p.version
				if (x.p.id !== y.p.id) return x.p.id.localeCompare(y.p.id)
				return x.a.id.localeCompare(y.a.id)
			})

			winner = { scope: node.scope, policy: scored[0].p, assignmentId: scored[0].a.id }
			break
		}

		if (!winner) continue

		const [rules, tiers] = await Promise.all([
			deps.repo.listPolicyRulesByPolicyId(winner.policy.id),
			deps.repo.listCancellationTiersByPolicyId(winner.policy.id),
		])

		resolved.push({
			category,
			policy: {
				...winner.policy,
				rules,
				cancellationTiers: tiers,
			},
			resolvedFromScope: winner.scope,
		})
	}

	return { policies: resolved }
}
