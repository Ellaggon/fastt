import type { APIRoute } from "astro"
import {
	db,
	and,
	CancellationTier,
	eq,
	inArray,
	Policy,
	PolicyGroup,
	PolicyRule,
	Product,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"
import { getPolicyCategoryLabel } from "@/data/policy/policy-categories"
import {
	getPolicyPresetDescription,
	getPolicyPresetLabel,
	POLICY_PRESET_CATALOG,
} from "@/data/policy/policy-presets"
import { requireProvider } from "@/lib/auth/requireProvider"
import { isPolicyBusinessCompatible } from "@/lib/policies/policy-business-compatibility"
import { getOwnedPolicyScopeIds } from "@/lib/policies/policyOwnership"
import { resolvePolicyBusinessContextForScope } from "@/lib/policies/resolve-policy-business-context"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"

function policyLabel(row: {
	description: unknown
	category: unknown
	policyPresetKey: unknown
	version: unknown
}) {
	const description = String(row.description ?? "").trim()
	if (description) return `${description} · v${Number(row.version ?? 1)}`
	const category = String(row.category ?? "")
	const preset = getPolicyPresetLabel(String(row.policyPresetKey ?? ""), category)
	return `${getPolicyCategoryLabel(category)} ${preset} · v${Number(row.version ?? 1)}`
}

export const GET: APIRoute = async ({ request, url }) => {
	const { providerId } = await requireProvider(request)
	const owned = await getOwnedPolicyScopeIds(providerId)
	const scope = String(url.searchParams.get("scope") ?? "rate_plan")
	const scopeId = String(url.searchParams.get("scopeId") ?? "").trim()
	const scopeOwned =
		(scope === "product" && owned.productIds.includes(scopeId)) ||
		(scope === "variant" && owned.variantIds.includes(scopeId)) ||
		(scope === "rate_plan" && owned.ratePlanIds.includes(scopeId))
	if (!scopeId || !scopeOwned) {
		return new Response(JSON.stringify({ error: "scope_not_found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}
	const businessContext = await resolvePolicyBusinessContextForScope({ scope, scopeId })
	if (!businessContext) {
		return new Response(JSON.stringify({ error: "scope_not_found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}
	const ratePlanName = await resolveRatePlanNameColumn()

	const products = owned.productIds.length
		? await db
				.select({ id: Product.id, name: Product.name, productType: Product.productType })
				.from(Product)
				.where(inArray(Product.id, owned.productIds))
		: []

	const variants = owned.variantIds.length
		? await db
				.select({
					id: Variant.id,
					name: Variant.name,
					productId: Variant.productId,
					productName: Product.name,
				})
				.from(Variant)
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.where(inArray(Variant.id, owned.variantIds))
		: []

	const ratePlans = owned.ratePlanIds.length
		? await db
				.select({
					id: RatePlan.id,
					variantId: RatePlan.variantId,
					variantName: Variant.name,
					productName: Product.name,
					ratePlanName,
					isDefault: RatePlan.isDefault,
				})
				.from(RatePlan)
				.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
				.innerJoin(Product, eq(Product.id, Variant.productId))
				.where(inArray(RatePlan.id, owned.ratePlanIds))
		: []

	const policies = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			category: PolicyGroup.category,
			description: Policy.description,
			version: Policy.version,
			status: Policy.status,
			policyPresetKey: (Policy as any).policyPresetKey,
			stayLengthType: (Policy as any).stayLengthType,
			refundBasis: (Policy as any).refundBasis,
			payoutBasis: (Policy as any).payoutBasis,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(and(eq(PolicyGroup.ownerProviderId, providerId), eq(Policy.status, "active")))

	const policyIds = policies.map((policy) => String(policy.id ?? "")).filter(Boolean)
	const [rules, tiers] = await Promise.all([
		policyIds.length
			? db.select().from(PolicyRule).where(inArray(PolicyRule.policyId, policyIds))
			: Promise.resolve([]),
		policyIds.length
			? db.select().from(CancellationTier).where(inArray(CancellationTier.policyId, policyIds))
			: Promise.resolve([]),
	])

	const rulesByPolicyId = new Map<string, Record<string, unknown>>()
	for (const rule of rules as any[]) {
		const policyId = String(rule.policyId ?? "")
		const ruleKey = String(rule.ruleKey ?? "").trim()
		if (!policyId || !ruleKey) continue
		if (!rulesByPolicyId.has(policyId)) rulesByPolicyId.set(policyId, {})
		rulesByPolicyId.get(policyId)![ruleKey] = rule.ruleValue
	}

	const tiersByPolicyId = new Map<string, any[]>()
	for (const tier of tiers as any[]) {
		const policyId = String(tier.policyId ?? "")
		if (!policyId) continue
		if (!tiersByPolicyId.has(policyId)) tiersByPolicyId.set(policyId, [])
		tiersByPolicyId.get(policyId)!.push({
			daysBeforeArrival: Number(tier.daysBeforeArrival ?? 0),
			hoursBeforeDeparture:
				tier.hoursBeforeDeparture == null ? null : Number(tier.hoursBeforeDeparture),
			penaltyType: String(tier.penaltyType ?? "percentage"),
			penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
		})
	}
	for (const list of tiersByPolicyId.values()) {
		list.sort((a, b) => Number(b.daysBeforeArrival ?? 0) - Number(a.daysBeforeArrival ?? 0))
	}

	const policyOptions = policies
		.map((policy) => ({
			...policy,
			label: policyLabel(policy),
			categoryLabel: getPolicyCategoryLabel(policy.category),
			presetLabel: getPolicyPresetLabel(
				String(policy.policyPresetKey ?? ""),
				String(policy.category ?? "")
			),
			rules: rulesByPolicyId.get(String(policy.id ?? "")) ?? {},
			cancellationTiers: tiersByPolicyId.get(String(policy.id ?? "")) ?? [],
		}))
		.filter((policy) => isPolicyBusinessCompatible(businessContext, policy))
	const presetOptions = POLICY_PRESET_CATALOG.filter((preset) =>
		isPolicyBusinessCompatible(businessContext, {
			category: preset.category,
			stayLengthType: preset.stayLengthType,
			refundBasis: preset.refundBasis,
			businesses: "businesses" in preset ? preset.businesses : undefined,
			rules: preset.rules,
			cancellationTiers: "cancellationTiers" in preset ? (preset.cancellationTiers ?? []) : [],
		})
	)

	return new Response(
		JSON.stringify({
			context: {
				productId: businessContext.productId,
				productType: businessContext.productType,
				business: businessContext.business,
				allowedCategories: businessContext.contract.allowedCategories,
			},
			policies: policyOptions,
			presets: presetOptions.map((preset) => ({
				key: preset.key,
				category: preset.category,
				label: getPolicyPresetLabel(preset.key, preset.category),
				categoryLabel: getPolicyCategoryLabel(preset.category),
				description: getPolicyPresetDescription(preset.key, preset.category),
				stayLengthType: preset.stayLengthType,
				refundBasis: preset.refundBasis,
				payoutBasis: preset.payoutBasis,
				rules: preset.rules,
				cancellationTiers: "cancellationTiers" in preset ? (preset.cancellationTiers ?? []) : [],
			})),
			scopes: {
				product: products.map((product) => ({
					id: String(product.id),
					label: String(product.name ?? product.id),
					helper: String(product.productType ?? "Hotel"),
				})),
				variant: variants.map((variant) => ({
					id: String(variant.id),
					label: String(variant.name ?? variant.id),
					helper: String(variant.productName ?? "Hotel"),
				})),
				rate_plan: ratePlans.map((plan) => ({
					id: String(plan.id),
					label: String(plan.ratePlanName ?? plan.id),
					helper: `${String(plan.productName ?? "Hotel")} · ${String(plan.variantName ?? "Habitación")}${plan.isDefault ? " · por defecto" : ""}`,
				})),
			},
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	)
}
