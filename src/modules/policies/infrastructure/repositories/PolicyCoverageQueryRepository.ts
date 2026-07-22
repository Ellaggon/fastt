import {
	and,
	db,
	eq,
	inArray,
	isNull,
	or,
	Policy,
	PolicyAssignment,
	Product,
	RatePlan,
	sql,
	Variant,
} from "@/shared/infrastructure/db/compat"

type PolicyCoverageRatePlanContext = {
	ratePlanId: string
	variantId: string
	productId: string
}

export type PolicyCoverageByRatePlan = PolicyCoverageRatePlanContext & {
	coveredCategories: string[]
	missingCategories: string[]
	isComplete: boolean
}

export type PolicyCoverageQueryParams = {
	providerId: string
	asOfDate: string
	channel?: string | null
	requiredCategories: readonly string[]
}

type AssignmentCoverageRow = {
	assignmentId: string
	policyGroupId: string
	category: string
	scope: "product" | "variant" | "rate_plan"
	scopeId: string
	channel: string | null
	effectiveFrom: string | null
	effectiveTo: string | null
	createdAt: number | Date | null
	policyId: string
	policyVersion: number
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
}

function toTime(value: number | Date | null): number {
	if (value instanceof Date) return value.getTime()
	return Number(value ?? 0)
}

function scopeRank(scope: AssignmentCoverageRow["scope"]): number {
	if (scope === "rate_plan") return 3
	if (scope === "variant") return 2
	return 1
}

function sortCoverageCandidates(a: AssignmentCoverageRow, b: AssignmentCoverageRow): number {
	const scopeDelta = scopeRank(b.scope) - scopeRank(a.scope)
	if (scopeDelta !== 0) return scopeDelta

	const aDated = a.effectiveFrom || a.effectiveTo ? 1 : 0
	const bDated = b.effectiveFrom || b.effectiveTo ? 1 : 0
	if (aDated !== bDated) return bDated - aDated

	const createdDelta = toTime(b.createdAt) - toTime(a.createdAt)
	if (createdDelta !== 0) return createdDelta

	const versionDelta = Number(b.policyVersion ?? 0) - Number(a.policyVersion ?? 0)
	if (versionDelta !== 0) return versionDelta

	if (a.policyId !== b.policyId) return a.policyId.localeCompare(b.policyId)
	return a.assignmentId.localeCompare(b.assignmentId)
}

export class PolicyCoverageQueryRepository {
	async listRatePlanCoverageByProvider(
		params: PolicyCoverageQueryParams
	): Promise<PolicyCoverageByRatePlan[]> {
		const providerId = String(params.providerId ?? "").trim()
		const asOfDate = String(params.asOfDate ?? "").trim()
		const requiredCategories = unique(params.requiredCategories)
		if (!providerId || !asOfDate) return []

		const ratePlans = await db
			.select({
				ratePlanId: RatePlan.id,
				variantId: Variant.id,
				productId: Product.id,
			})
			.from(RatePlan)
			.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
			.innerJoin(Product, eq(Product.id, Variant.productId))
			.where(eq(Product.providerId, providerId))

		const contexts = ratePlans.map((row) => ({
			ratePlanId: String(row.ratePlanId),
			variantId: String(row.variantId),
			productId: String(row.productId),
		}))
		if (!contexts.length) return []

		const ratePlanIds = unique(contexts.map((row) => row.ratePlanId))
		const variantIds = unique(contexts.map((row) => row.variantId))
		const productIds = unique(contexts.map((row) => row.productId))
		const channel = String(params.channel ?? "").trim() || null
		const channelFilter = channel
			? or(eq(PolicyAssignment.channel, channel), isNull(PolicyAssignment.channel))
			: isNull(PolicyAssignment.channel)

		const scopeFilters = [
			ratePlanIds.length
				? and(
						eq(PolicyAssignment.scope, "rate_plan"),
						inArray(PolicyAssignment.scopeId, ratePlanIds)
					)
				: undefined,
			variantIds.length
				? and(eq(PolicyAssignment.scope, "variant"), inArray(PolicyAssignment.scopeId, variantIds))
				: undefined,
			productIds.length
				? and(eq(PolicyAssignment.scope, "product"), inArray(PolicyAssignment.scopeId, productIds))
				: undefined,
		].filter(Boolean)

		const rows = (await db
			.select({
				assignmentId: PolicyAssignment.id,
				policyGroupId: PolicyAssignment.policyGroupId,
				category: PolicyAssignment.category,
				scope: PolicyAssignment.scope,
				scopeId: PolicyAssignment.scopeId,
				channel: PolicyAssignment.channel,
				effectiveFrom: PolicyAssignment.effectiveFrom,
				effectiveTo: PolicyAssignment.effectiveTo,
				createdAt: PolicyAssignment.createdAt,
				policyId: Policy.id,
				policyVersion: Policy.version,
			})
			.from(PolicyAssignment)
			.innerJoin(Policy, eq(Policy.groupId, PolicyAssignment.policyGroupId))
			.where(
				and(
					eq(PolicyAssignment.isActive, true),
					or(...scopeFilters),
					channelFilter,
					inArray(PolicyAssignment.category, requiredCategories),
					eq(Policy.status, "active"),
					or(
						isNull(PolicyAssignment.effectiveFrom),
						sql`${PolicyAssignment.effectiveFrom} <= ${asOfDate}`
					),
					or(
						isNull(PolicyAssignment.effectiveTo),
						sql`${PolicyAssignment.effectiveTo} >= ${asOfDate}`
					),
					or(isNull(Policy.effectiveFrom), sql`${Policy.effectiveFrom} <= ${asOfDate}`),
					or(isNull(Policy.effectiveTo), sql`${Policy.effectiveTo} >= ${asOfDate}`)
				)
			)) as AssignmentCoverageRow[]

		return contexts.map((context) => {
			const coveredCategories = requiredCategories.filter((category) => {
				const candidates = rows.filter((row) => {
					if (row.category !== category) return false
					if (row.scope === "rate_plan") return row.scopeId === context.ratePlanId
					if (row.scope === "variant") return row.scopeId === context.variantId
					return row.scopeId === context.productId
				})
				return candidates.sort(sortCoverageCandidates)[0] != null
			})
			const covered = new Set(coveredCategories)
			const missingCategories = requiredCategories.filter((category) => !covered.has(category))
			return {
				...context,
				coveredCategories,
				missingCategories,
				isComplete: missingCategories.length === 0,
			}
		})
	}
}
