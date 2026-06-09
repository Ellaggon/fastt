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
} from "astro:db"
import { POLICY_PRESET_CATALOG } from "@/data/policy/policy-presets"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOwnedPolicyScopeIds } from "@/lib/policies/policyOwnership"
import { resolveRatePlanNameColumn } from "@/lib/rates/ratePlanSchemaCompat"

const categoryLabels: Record<string, string> = {
	Cancellation: "Cancelación",
	Payment: "Pago",
	CheckIn: "Ingreso y salida",
	NoShow: "No presentación",
}

const presetLabels: Record<string, string> = {
	flexible: "Flexible",
	moderate: "Moderada",
	limited: "Limitada",
	firm: "Firme",
	strict: "Estricta",
	long_term: "Larga estadía",
	non_refundable: "No reembolsable",
	pay_at_property: "Pago en propiedad",
	prepayment_full: "Prepago total",
	deposit_50: "Depósito 50%",
	standard_check_in: "Ingreso estándar",
	late_arrival: "Llegada tardía",
	no_show_first_night: "No presentación: primera noche",
	no_show_full_stay: "No presentación: estadía completa",
	no_show_percentage_100: "No presentación: 100%",
}

function policyLabel(row: {
	description: unknown
	category: unknown
	policyPresetKey: unknown
	version: unknown
}) {
	const description = String(row.description ?? "").trim()
	if (description) return `${description} · v${Number(row.version ?? 1)}`
	const preset = presetLabels[String(row.policyPresetKey ?? "")] ?? "Personalizada"
	const category = categoryLabels[String(row.category ?? "")] ?? "Condición"
	return `${category} ${preset} · v${Number(row.version ?? 1)}`
}

export const GET: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const owned = await getOwnedPolicyScopeIds(providerId)
	const ratePlanName = await resolveRatePlanNameColumn()

	const products = owned.productIds.length
		? await db
				.select({ id: Product.id, name: Product.name, productType: Product.productType })
				.from(Product)
				.where(inArray(Product.id, owned.productIds))
				.all()
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
				.all()
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
				.all()
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
		.all()
	const policyIds = policies.map((policy) => String(policy.id ?? "")).filter(Boolean)
	const [rules, tiers] = await Promise.all([
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
			penaltyType: String(tier.penaltyType ?? "percentage"),
			penaltyAmount: tier.penaltyAmount == null ? null : Number(tier.penaltyAmount),
		})
	}
	for (const list of tiersByPolicyId.values()) {
		list.sort((a, b) => Number(b.daysBeforeArrival ?? 0) - Number(a.daysBeforeArrival ?? 0))
	}

	return new Response(
		JSON.stringify({
			policies: policies.map((policy) => ({
				...policy,
				label: policyLabel(policy),
				categoryLabel:
					categoryLabels[String(policy.category ?? "")] ?? String(policy.category ?? ""),
				presetLabel: presetLabels[String(policy.policyPresetKey ?? "")] ?? "Personalizada",
				rules: rulesByPolicyId.get(String(policy.id ?? "")) ?? {},
				cancellationTiers: tiersByPolicyId.get(String(policy.id ?? "")) ?? [],
			})),
			presets: POLICY_PRESET_CATALOG.map((preset) => ({
				key: preset.key,
				category: preset.category,
				label: presetLabels[preset.key] ?? preset.name,
				categoryLabel: categoryLabels[preset.category] ?? preset.category,
				description: preset.guestFacing || preset.description,
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
