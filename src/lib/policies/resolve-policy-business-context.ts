import { db, eq, first, Product } from "@/shared/infrastructure/db/compat"
import { resolveProductIdForPolicyScope } from "@/lib/policies/policyOwnership"
import {
	policyBusinessContextFromProduct,
	type PolicyBusinessContext,
} from "@/lib/policies/policy-business-compatibility"

export async function resolvePolicyBusinessContextForScope(params: {
	scope: string
	scopeId: string
}): Promise<PolicyBusinessContext | null> {
	const productId = await resolveProductIdForPolicyScope(params)
	if (!productId) return null
	const product = await db
		.select({ id: Product.id, productType: Product.productType })
		.from(Product)
		.where(eq(Product.id, productId))
		.then(first)
	if (!product?.id) return null
	return policyBusinessContextFromProduct({
		productId: product.id,
		productType: product.productType,
	})
}
