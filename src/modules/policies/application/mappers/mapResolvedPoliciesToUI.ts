import type { PolicyResolutionDTO } from "../dto/PolicyResolutionDTO"
import type { LegacyPolicyResolutionResult } from "../adapters/policyResolutionAdapter"

/**
 * UI adapter for the canonical resolver output.
 *
 * The hotel detail UI historically consumed EffectivePolicyRow[] from the compiled snapshot cache.
 * During migration, we keep the minimal shape it needs: { category, description }.
 *
 * IMPORTANT:
 * - No business logic here; only structural mapping.
 * - Do not mutate or re-resolve anything.
 */
export function mapResolvedPoliciesToUI(
	resolved: PolicyResolutionDTO | LegacyPolicyResolutionResult
): Array<{
	category: string
	description: string
	version: number
	resolvedFromScope: "rate_plan" | "variant" | "product" | "global"
}> {
	const items = Array.isArray(resolved?.policies) ? resolved.policies : []
	return items.map((p) => ({
		category: String(p.category),
		description: String(p.policy?.description ?? ""),
		version: Number((p.policy as any)?.version ?? 0),
		resolvedFromScope: (p.resolvedFromScope as any) || "global",
	}))
}
