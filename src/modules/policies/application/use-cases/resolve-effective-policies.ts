import { toISODate } from "@/shared/domain/date/date.utils"
import {
	logPolicyContractMismatch,
	logPolicyContractPathUsed,
} from "@/lib/observability/migration-logger"
import { getFeatureFlag, type FeatureFlagContext } from "@/config/featureFlags"
import { mapDTOToLegacy } from "../adapters/policyResolutionAdapter"
import type { LegacyPolicyResolutionResult } from "../adapters/policyResolutionAdapter"
import type { PolicyResolutionDTO } from "../dto/PolicyResolutionDTO"
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
	checkIn?: string
	checkOut?: string
	channel?: string
	requiredCategories?: string[]
	onMissingCategory?: "return_null" | "throw_error"
	includeTrace?: boolean
	requestId?: string
	featureContext?: FeatureFlagContext
	dtoV2Enabled?: boolean
	endpoint?: string
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

export type ResolveEffectivePoliciesResult = PolicyResolutionDTO

function resolveAsOfDate(ctx: ScopeContext): string {
	const rawCheckIn = String(ctx.checkIn ?? "").trim()
	if (!rawCheckIn) return toISODate(new Date())
	const parsed = new Date(`${rawCheckIn}T00:00:00.000Z`)
	if (Number.isNaN(parsed.getTime())) return toISODate(new Date())
	return toISODate(parsed)
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
	const asOfDate = resolveAsOfDate(ctx)
	const productId = String(ctx.productId ?? "").trim()
	const requiredCategories = uniq(
		(Array.isArray(ctx.requiredCategories) ? ctx.requiredCategories : [])
			.map((category) => String(category ?? "").trim())
			.filter(Boolean)
	)
	if (!productId) {
		const missingCategories = requiredCategories
		if (ctx.onMissingCategory === "throw_error" && missingCategories.length > 0) {
			throw new Error(`MISSING_POLICY_CATEGORY:${missingCategories.join(",")}`)
		}
		return {
			version: "v2",
			policies: [],
			missingCategories,
			coverage: {
				hasFullCoverage: missingCategories.length === 0,
			},
			asOfDate,
			warnings: [],
		}
	}

	const scopeChain = buildScopeChain({ ...ctx, productId })
	const channels: Array<string | null> = ctx.channel ? [ctx.channel, null] : [null]

	const assignments = await deps.repo.listActiveAssignments({ scopeChain, channels })
	if (!assignments.length) {
		const missingCategories = requiredCategories
		if (ctx.onMissingCategory === "throw_error" && missingCategories.length > 0) {
			throw new Error(`MISSING_POLICY_CATEGORY:${missingCategories.join(",")}`)
		}
		return {
			version: "v2",
			policies: [],
			missingCategories,
			coverage: {
				hasFullCoverage: missingCategories.length === 0,
			},
			asOfDate,
			warnings: [],
		}
	}

	const categories = uniq(assignments.map((a) => a.category)).sort((a, b) => a.localeCompare(b))

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

	const resolvedCategories = new Set(resolved.map((item) => String(item.category)))
	const missingCategories = requiredCategories.filter(
		(category) => !resolvedCategories.has(category)
	)
	if (missingCategories.length > 0) {
		logPolicyContractMismatch({
			requestId: String(ctx.requestId ?? "policy-anon"),
			domain: "policies",
			endpoint: "resolveEffectivePolicies",
			productId,
			variantId: String(ctx.variantId ?? "").trim() || null,
			ratePlanId: String(ctx.ratePlanId ?? "").trim() || null,
			missingCategories,
		})
	}
	if (ctx.onMissingCategory === "throw_error" && missingCategories.length > 0) {
		throw new Error(`MISSING_POLICY_CATEGORY:${missingCategories.join(",")}`)
	}

	return {
		version: "v2",
		policies: resolved,
		missingCategories,
		coverage: {
			hasFullCoverage: missingCategories.length === 0,
		},
		asOfDate,
		warnings: [],
	}
}

export async function resolveEffectivePoliciesByContract(
	deps: { repo: PolicyResolutionRepositoryPort },
	ctx: ScopeContext
): Promise<PolicyResolutionDTO | LegacyPolicyResolutionResult> {
	const dto = await resolveEffectivePolicies(deps, ctx)
	const dtoEnabled =
		typeof ctx.dtoV2Enabled === "boolean"
			? ctx.dtoV2Enabled
			: getFeatureFlag("POLICY_DTO_V2_ENABLED", ctx.featureContext)
	let endpoint = String(ctx.endpoint ?? "").trim()
	if (!endpoint && ctx.featureContext?.request) {
		try {
			endpoint = new URL(ctx.featureContext.request.url).pathname
		} catch {
			endpoint = "policies.resolve"
		}
	}
	if (!endpoint) endpoint = "policies.resolve"
	logPolicyContractPathUsed({
		requestId: String(ctx.requestId ?? "policy-anon"),
		domain: "policies",
		endpoint,
		contract: dtoEnabled ? "v2" : "legacy",
		ratePlanId: String(ctx.ratePlanId ?? "").trim() || null,
	})
	if (!dtoEnabled) {
		return mapDTOToLegacy(dto)
	}
	return dto
}
