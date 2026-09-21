import { db, eq, Product, RatePlan, Variant } from "@/shared/infrastructure/db/compat"
import {
	evaluatePolicyBusinessCompatibility,
	policyBusinessContextFromProduct,
} from "./policy-business-compatibility"
import { resolveEffectivePolicies } from "@/modules/policies/public"

export type TourPolicyCompatibilityFinding = {
	ratePlanId: string
	category: string
	policyId: string
	code: string
	message: string
}

/** Read-only gate for publication. It never rewrites old policy versions or snapshots. */
export async function auditTourProductPolicyCompatibility(productId: string) {
	const product = await db
		.select({ id: Product.id, productType: Product.productType })
		.from(Product)
		.where(eq(Product.id, productId))
		.then((rows) => rows[0])
	if (!product || String(product.productType).toLowerCase() !== "tour") return []
	const context = policyBusinessContextFromProduct({
		productId: product.id,
		productType: product.productType,
	})
	const variants = await db
		.select({ id: Variant.id })
		.from(Variant)
		.where(eq(Variant.productId, productId))
	const findings: TourPolicyCompatibilityFinding[] = []
	for (const variant of variants) {
		const ratePlans = await db
			.select({ id: RatePlan.id })
			.from(RatePlan)
			.where(eq(RatePlan.variantId, variant.id))
		for (const ratePlan of ratePlans) {
			const resolved = await resolveEffectivePolicies({
				productId,
				variantId: String(variant.id),
				ratePlanId: String(ratePlan.id),
				channel: "web",
				onMissingCategory: "return_null",
			})
			for (const entry of resolved.policies as any[]) {
				const policy = entry.policy ?? {}
				const rules = Object.fromEntries(
					(policy.rules ?? []).map((rule: any) => [String(rule.ruleKey), rule.ruleValue])
				)
				const issue = evaluatePolicyBusinessCompatibility(context, {
					category: String(entry.category ?? ""),
					stayLengthType: policy.stayLengthType,
					refundBasis: policy.refundBasis,
					rules,
					cancellationTiers: policy.cancellationTiers,
				})[0]
				if (issue)
					findings.push({
						ratePlanId: String(ratePlan.id),
						category: String(entry.category),
						policyId: String(policy.id),
						...issue,
					})
			}
		}
	}
	return findings
}
