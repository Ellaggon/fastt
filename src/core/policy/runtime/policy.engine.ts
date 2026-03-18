import {
	sql,
	db,
	and,
	or,
	isNull,
	eq,
	inArray,
	ne,
	Policy,
	PolicyAssignment,
	PolicyGroup,
	PolicyRule,
	CancellationTier,
} from "astro:db"

const scopeChainCache = new Map<string, any[]>()

interface ResolveParams {
	hotelId?: string | null
	productId?: string | null
	variantId?: string | null
	channel?: string | null
	category?: string | null
	arrivalDate?: string | null
	includeCancellation?: boolean
	includeRules?: boolean
}

export async function resolvePolicies(params: ResolveParams) {
	const {
		hotelId,
		productId,
		variantId,
		channel,
		category,
		arrivalDate,
		includeCancellation = false,
		includeRules,
	} = params

	const scopeOrder = [
		{ scope: "variant", id: variantId },
		{ scope: "product", id: productId },
		{ scope: "hotel", id: hotelId },
	].filter((s) => s.id)

	const scopeIds = scopeOrder.map((s) => s.id!)
	if (!scopeIds.length) return []

	const scopeChainKey = `${hotelId}|${productId}|${variantId}|${channel}|${category}|${arrivalDate}|${includeCancellation}|${includeRules}`

	const cached = scopeChainCache.get(scopeChainKey)
	if (cached) return cached

	const channelFilter =
		channel != null
			? or(eq(PolicyAssignment.channel, channel), isNull(PolicyAssignment.channel))
			: isNull(PolicyAssignment.channel)

	const whereConditions = [
		inArray(PolicyAssignment.scopeId, scopeIds),
		eq(Policy.status, "active"),
		channelFilter,
		eq(PolicyAssignment.isActive, true),
	]

	if (category) {
		whereConditions.push(eq(PolicyGroup.category, category))
	} else if (!includeCancellation) {
		whereConditions.push(ne(PolicyGroup.category, "Cancellation"))
	}

	if (params.arrivalDate) {
		whereConditions.push(
			or(isNull(Policy.effectiveFrom), sql`${Policy.effectiveFrom} <= ${params.arrivalDate}`)
		)

		whereConditions.push(
			or(isNull(Policy.effectiveTo), sql`${Policy.effectiveTo} >= ${params.arrivalDate}`)
		)
	}

	const rows = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			category: PolicyGroup.category,
			description: Policy.description,
			version: Policy.version,
			scope: PolicyAssignment.scope,
			scopeId: PolicyAssignment.scopeId,
		})
		.from(PolicyAssignment)
		.innerJoin(Policy, eq(Policy.groupId, PolicyAssignment.policyGroupId))
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(and(...whereConditions))

	/* priority resolver determinístico */
	const sorted = rows.sort((a, b) => scopeIds.indexOf(a.scopeId) - scopeIds.indexOf(b.scopeId))

	const resolved = new Map<string, any>()

	for (const row of sorted) {
		if (!resolved.has(row.groupId)) {
			resolved.set(row.groupId, {
				id: row.id,
				groupId: row.groupId,
				category: row.category,
				description: row.description,
				version: row.version,
				sourceScope: row.scope,
			})
		}
	}
	const result = [...resolved.values()]

	if (params.includeRules && result.length) {
		const policyIds = result.map((p) => p.id)

		const rules = await db.select().from(PolicyRule).where(inArray(PolicyRule.policyId, policyIds))

		const tiers = await db
			.select()
			.from(CancellationTier)
			.where(inArray(CancellationTier.policyId, policyIds))

		for (const policy of result) {
			policy.rules = rules.filter((r) => r.policyId === policy.id)
			policy.cancellationTiers = tiers.filter((t) => t.policyId === policy.id)
		}
	}

	scopeChainCache.set(scopeChainKey, result)
	return result
}
