import {
	first,
	and,
	db,
	eq,
	inArray,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	Product,
	RatePlan,
	Variant,
} from "@/shared/infrastructure/db/compat"

export type OwnedPolicyScopeIds = {
	productIds: string[]
	variantIds: string[]
	ratePlanIds: string[]
}

function asIds(rows: Array<{ id: unknown }>): string[] {
	return rows.map((row) => String(row.id ?? "").trim()).filter(Boolean)
}

export async function getOwnedPolicyScopeIds(providerId: string): Promise<OwnedPolicyScopeIds> {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return { productIds: [], variantIds: [], ratePlanIds: [] }

	const products = await db
		.select({ id: Product.id })
		.from(Product)
		.where(eq(Product.providerId, normalizedProviderId))

	const productIds = asIds(products)

	const variants = productIds.length
		? await db
				.select({ id: Variant.id })
				.from(Variant)
				.where(inArray(Variant.productId, productIds))
		: []
	const variantIds = asIds(variants)

	const ratePlans = variantIds.length
		? await db
				.select({ id: RatePlan.id })
				.from(RatePlan)
				.where(inArray(RatePlan.variantId, variantIds))
		: []
	const ratePlanIds = asIds(ratePlans)

	return { productIds, variantIds, ratePlanIds }
}

export async function ensurePolicyScopeOwnedByProvider(params: {
	providerId: string
	scope: string
	scopeId: string
}): Promise<boolean> {
	const scope = String(params.scope ?? "").trim()
	const scopeId = String(params.scopeId ?? "").trim()
	if (!scope || !scopeId) return false

	const owned = await getOwnedPolicyScopeIds(params.providerId)
	if (scope === "product") return owned.productIds.includes(scopeId)
	if (scope === "variant") return owned.variantIds.includes(scopeId)
	if (scope === "rate_plan") return owned.ratePlanIds.includes(scopeId)
	return false
}

export async function resolveProductIdForPolicyScope(params: {
	scope: string
	scopeId: string
}): Promise<string | null> {
	const scope = String(params.scope ?? "").trim()
	const scopeId = String(params.scopeId ?? "").trim()
	if (!scope || !scopeId) return null
	if (scope === "product") return scopeId
	if (scope === "variant") {
		const row = await db
			.select({ productId: Variant.productId })
			.from(Variant)
			.where(eq(Variant.id, scopeId))
			.then(first)
		return row?.productId ? String(row.productId) : null
	}
	if (scope === "rate_plan") {
		const row = await db
			.select({ productId: Variant.productId })
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.where(eq(RatePlan.id, scopeId))
			.then(first)
		return row?.productId ? String(row.productId) : null
	}
	return null
}

export async function getOwnedPolicyGroupIds(
	providerId: string,
	opts: { activeOnly?: boolean } = {}
): Promise<string[]> {
	const owned = await getOwnedPolicyScopeIds(providerId)
	const scopePredicates = [
		owned.productIds.length
			? {
					scope: "product",
					ids: owned.productIds,
				}
			: null,
		owned.variantIds.length
			? {
					scope: "variant",
					ids: owned.variantIds,
				}
			: null,
		owned.ratePlanIds.length
			? {
					scope: "rate_plan",
					ids: owned.ratePlanIds,
				}
			: null,
	].filter((item): item is { scope: string; ids: string[] } => item != null)

	const groups = new Set<string>()
	const directRows = await db
		.select({ id: PolicyGroup.id })
		.from(PolicyGroup)
		.where(eq((PolicyGroup as any).ownerProviderId, String(providerId ?? "").trim()))

	for (const row of directRows) {
		const groupId = String(row.id ?? "").trim()
		if (groupId) groups.add(groupId)
	}

	for (const predicate of scopePredicates) {
		const conditions = [
			eq(PolicyAssignment.scope, predicate.scope),
			inArray(PolicyAssignment.scopeId, predicate.ids),
		]
		if (opts.activeOnly !== false) {
			conditions.push(eq(PolicyAssignment.isActive, true))
		}
		const rows = await db
			.select({ policyGroupId: PolicyAssignment.policyGroupId })
			.from(PolicyAssignment)
			.where(and(...conditions))

		for (const row of rows) {
			const groupId = String(row.policyGroupId ?? "").trim()
			if (groupId) groups.add(groupId)
		}
	}

	return [...groups].sort((a, b) => a.localeCompare(b))
}

export async function ensurePolicyOwnedByProvider(params: {
	providerId: string
	policyId: string
}): Promise<boolean> {
	const policyId = String(params.policyId ?? "").trim()
	if (!policyId) return false

	const policy = await db
		.select({ groupId: Policy.groupId })
		.from(Policy)
		.where(eq(Policy.id, policyId))
		.then(first)
	if (!policy?.groupId) return false

	const ownedGroupIds = await getOwnedPolicyGroupIds(params.providerId, { activeOnly: false })
	return ownedGroupIds.includes(String(policy.groupId))
}

export async function ensurePolicyAssignmentOwnedByProvider(params: {
	providerId: string
	assignmentId: string
}): Promise<boolean> {
	const assignmentId = String(params.assignmentId ?? "").trim()
	if (!assignmentId) return false

	const assignment = await db
		.select({
			scope: PolicyAssignment.scope,
			scopeId: PolicyAssignment.scopeId,
		})
		.from(PolicyAssignment)
		.where(eq(PolicyAssignment.id, assignmentId))
		.then(first)
	if (!assignment) return false

	return ensurePolicyScopeOwnedByProvider({
		providerId: params.providerId,
		scope: String(assignment.scope ?? ""),
		scopeId: String(assignment.scopeId ?? ""),
	})
}
