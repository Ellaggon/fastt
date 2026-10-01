import {
	and,
	db,
	eq,
	inArray,
	Product,
	RatePlan,
	RatePlanConditionState,
	Variant,
} from "@/shared/infrastructure/db/compat"
import {
	listPolicyCoverageByProvider,
	resolveEffectivePolicies,
	REQUIRED_POLICY_CATEGORIES,
	summarizeMissingPolicyCategories,
} from "@/modules/policies/public"
import { getRequiredPolicyCategories } from "@/lib/policies/policy-business-contract"
import {
	evaluateEffectivePolicyReadiness,
	policyBusinessContextFromProduct,
} from "@/lib/policies/policy-business-compatibility"
import type { PolicyCategory } from "@/modules/policies/public"

export type RatePlanConditionsSummary = {
	conditionsComplete: boolean
	totalCategories: number
	coveredCategories: number
	missingCategories: string[]
	policyCoverageUpdatedAt: Date | string | null
	summary: string
}

type RatePlanConditionContext = {
	ratePlanId: string
	providerId: string
	productId: string
	variantId: string
	productType: string
}

const DEFAULT_CHANNEL = "web"
const STATE_MAX_AGE_MS = Number(
	process.env.FASTT_RATE_PLAN_CONDITION_STATE_MAX_AGE_MS ?? 30 * 60 * 1000
)

/** Serialize background refreshes so they cannot starve the shared Postgres pool. */
let conditionRefreshQueue: Promise<void> = Promise.resolve()
const conditionRefreshInflight = new Set<string>()

function conditionRefreshKey(ratePlanId: string, channel: string) {
	return `${channel}:${ratePlanId}`
}

function unique(values: readonly unknown[]): string[] {
	return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10)
}

function stateId(ratePlanId: string, channel = DEFAULT_CHANNEL): string {
	return `${ratePlanId}:${channel || DEFAULT_CHANNEL}`
}

function asMissingCategories(value: unknown, required: readonly PolicyCategory[]): string[] {
	if (!required.length) return ["Contrato de políticas no definido"]
	if (!Array.isArray(value)) return [...required]
	const requiredSet = new Set<string>(required)
	return value
		.map((item) => String(item ?? "").trim())
		.filter((category) => requiredSet.has(category))
}

function summaryForMissing(missingCategories: readonly string[]): string {
	if (!missingCategories.length) return "Condiciones completas"
	return `Faltan: ${summarizeMissingPolicyCategories(missingCategories).replace(/^Pendientes:\s*/, "")}`
}

function fallbackSummary(): RatePlanConditionsSummary {
	const missingCategories = [...REQUIRED_POLICY_CATEGORIES]
	return {
		conditionsComplete: false,
		totalCategories: missingCategories.length,
		coveredCategories: 0,
		missingCategories,
		policyCoverageUpdatedAt: null,
		summary: "Sin condiciones configuradas",
	}
}

function isFresh(value: unknown): boolean {
	const time = value ? new Date(value as any).getTime() : 0
	return Number.isFinite(time) && Date.now() - time <= STATE_MAX_AGE_MS
}

async function listContextsByRatePlanIds(ratePlanIds: readonly string[]) {
	const ids = unique(ratePlanIds)
	if (!ids.length) return []
	return db
		.select({
			ratePlanId: RatePlan.id,
			providerId: Product.providerId,
			productId: Product.id,
			variantId: Variant.id,
			productType: Product.productType,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(inArray(RatePlan.id, ids))
}

async function listContextsByProvider(providerId: string) {
	const normalizedProviderId = String(providerId ?? "").trim()
	if (!normalizedProviderId) return []
	return db
		.select({
			ratePlanId: RatePlan.id,
			providerId: Product.providerId,
			productId: Product.id,
			variantId: Variant.id,
			productType: Product.productType,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(eq(Product.providerId, normalizedProviderId))
}

async function listAllContexts() {
	return db
		.select({
			ratePlanId: RatePlan.id,
			providerId: Product.providerId,
			productId: Product.id,
			variantId: Variant.id,
			productType: Product.productType,
		})
		.from(RatePlan)
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
}

export async function readRatePlanConditionSummaries(
	ratePlanIds: readonly string[],
	channel = DEFAULT_CHANNEL
): Promise<Map<string, RatePlanConditionsSummary>> {
	const ids = unique(ratePlanIds)
	const result = new Map<string, RatePlanConditionsSummary>()
	if (!ids.length) return result

	const rows = await db
		.select({
			ratePlanId: RatePlanConditionState.ratePlanId,
			missingCategoriesJson: RatePlanConditionState.missingCategoriesJson,
			policyCoverageUpdatedAt: RatePlanConditionState.policyCoverageUpdatedAt,
			updatedAt: RatePlanConditionState.updatedAt,
			productType: Product.productType,
		})
		.from(RatePlanConditionState)
		.innerJoin(RatePlan, eq(RatePlan.id, RatePlanConditionState.ratePlanId))
		.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
		.innerJoin(Product, eq(Product.id, Variant.productId))
		.where(
			and(
				inArray(RatePlanConditionState.ratePlanId, ids),
				eq(RatePlanConditionState.channel, channel || DEFAULT_CHANNEL)
			)
		)
		.catch(() => [])

	for (const row of rows) {
		const ratePlanId = String(row.ratePlanId ?? "").trim()
		if (!ratePlanId) continue
		const requiredCategories = getRequiredPolicyCategories(row.productType)
		const missingCategories = asMissingCategories(row.missingCategoriesJson, requiredCategories)
		result.set(ratePlanId, {
			conditionsComplete: requiredCategories.length > 0 && missingCategories.length === 0,
			totalCategories: requiredCategories.length,
			coveredCategories: Math.max(requiredCategories.length - missingCategories.length, 0),
			missingCategories,
			policyCoverageUpdatedAt: row.policyCoverageUpdatedAt ?? null,
			summary:
				requiredCategories.length > 0 && missingCategories.length === 0
					? "Condiciones completas"
					: summaryForMissing(missingCategories),
		})
	}

	const refreshIds = unique([
		...ids.filter((id) => !result.has(id)),
		...rows.filter((row) => !isFresh(row.updatedAt)).map((row) => String(row.ratePlanId)),
	])
	if (refreshIds.length) {
		scheduleRatePlanConditionStateRefresh({ ratePlanIds: refreshIds, channel })
	}

	// Legacy coverage snapshots only record presence. Tours must not inherit a false
	// green state from those rows; use the cached effective-policy resolver instead.
	const tourContexts = (await listContextsByRatePlanIds(ids)).filter(
		(context) => String(context.productType).toLowerCase() === "tour"
	)
	await Promise.all(
		tourContexts.map(async (context) => {
			const business = policyBusinessContextFromProduct(context)
			const resolved = await resolveEffectivePolicies({
				productId: context.productId,
				variantId: context.variantId,
				ratePlanId: context.ratePlanId,
				channel: channel || DEFAULT_CHANNEL,
				requiredCategories: [...business.contract.requiredCategories],
				onMissingCategory: "return_null",
			})
			const readiness = evaluateEffectivePolicyReadiness(
				business,
				resolved.policies,
				resolved.missingCategories
			)
			result.set(context.ratePlanId, {
				conditionsComplete: readiness.isSellableByContract,
				totalCategories: business.contract.requiredCategories.length,
				coveredCategories: readiness.coverageCount,
				missingCategories: [
					...new Set([...readiness.missingCategories, ...readiness.invalidCategories]),
				],
				policyCoverageUpdatedAt: null,
				summary: readiness.compatibilityIssues.length
					? readiness.compatibilityIssues.map((issue) => issue.message).join(" ")
					: summaryForMissing(readiness.missingCategories),
			})
		})
	)
	return result
}

function scheduleRatePlanConditionStateRefresh(params: {
	ratePlanIds: readonly string[]
	channel: string
}) {
	const channel = params.channel
	const pendingIds = unique(params.ratePlanIds).filter((ratePlanId) => {
		const key = conditionRefreshKey(ratePlanId, channel)
		if (conditionRefreshInflight.has(key)) return false
		conditionRefreshInflight.add(key)
		return true
	})
	if (!pendingIds.length) return

	conditionRefreshQueue = conditionRefreshQueue
		.then(() => refreshRatePlanConditionStates({ ratePlanIds: pendingIds, channel }))
		.catch((error) => {
			console.error("rate_plan.condition_state.refresh_failed", {
				error: error instanceof Error ? error.message : String(error),
				count: pendingIds.length,
			})
		})
		.finally(() => {
			for (const ratePlanId of pendingIds) {
				conditionRefreshInflight.delete(conditionRefreshKey(ratePlanId, channel))
			}
		})
}

export async function refreshRatePlanConditionStates(params: {
	ratePlanIds?: readonly string[]
	providerId?: string | null
	channel?: string | null
}): Promise<void> {
	const channel = String(params.channel ?? DEFAULT_CHANNEL).trim() || DEFAULT_CHANNEL
	const contexts = params.ratePlanIds?.length
		? await listContextsByRatePlanIds(params.ratePlanIds)
		: params.providerId
			? await listContextsByProvider(String(params.providerId ?? ""))
			: await listAllContexts()
	const normalizedContexts: RatePlanConditionContext[] = contexts.map((row) => ({
		ratePlanId: String(row.ratePlanId),
		providerId: String(row.providerId),
		productId: String(row.productId),
		variantId: String(row.variantId),
		productType: String(row.productType ?? ""),
	}))
	if (!normalizedContexts.length) return

	const providers = unique(normalizedContexts.map((row) => row.providerId))
	const now = new Date()

	for (const providerId of providers) {
		const providerContexts = normalizedContexts.filter((row) => row.providerId === providerId)
		const groups = new Map<
			string,
			{ categories: readonly PolicyCategory[]; contexts: RatePlanConditionContext[] }
		>()
		for (const context of providerContexts) {
			const categories = getRequiredPolicyCategories(context.productType)
			const key = JSON.stringify(categories)
			const group = groups.get(key) ?? { categories, contexts: [] }
			group.contexts.push(context)
			groups.set(key, group)
		}
		for (const group of groups.values()) {
			const coverageRows = group.categories.length
				? await listPolicyCoverageByProvider({
						providerId,
						asOfDate: todayIso(),
						channel,
						requiredCategories: group.categories,
					})
				: []
			const coverageByRatePlanId = new Map(
				coverageRows.map((coverage) => [String(coverage.ratePlanId), coverage])
			)
			for (const context of group.contexts) {
				const ratePlanId = context.ratePlanId
				const coverage = coverageByRatePlanId.get(ratePlanId)
				const missingCategories = group.categories.length
					? (coverage?.missingCategories ?? [...group.categories])
					: ["Contrato de políticas no definido"]
				const isComplete = group.categories.length > 0 && missingCategories.length === 0
				await db
					.insert(RatePlanConditionState)
					.values({
						id: stateId(ratePlanId, channel),
						ratePlanId,
						providerId: context.providerId,
						productId: context.productId,
						variantId: context.variantId,
						channel,
						totalCategories: group.categories.length,
						coveredCategories: Math.max(group.categories.length - missingCategories.length, 0),
						missingCategoriesJson: missingCategories,
						conditionsComplete: isComplete,
						summary: summaryForMissing(missingCategories),
						policyCoverageUpdatedAt: now,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: [RatePlanConditionState.ratePlanId, RatePlanConditionState.channel],
						set: {
							providerId: context.providerId,
							productId: context.productId,
							variantId: context.variantId,
							totalCategories: group.categories.length,
							coveredCategories: Math.max(group.categories.length - missingCategories.length, 0),
							missingCategoriesJson: missingCategories,
							conditionsComplete: isComplete,
							summary: summaryForMissing(missingCategories),
							policyCoverageUpdatedAt: now,
							updatedAt: now,
						},
					})
					.catch(() => undefined)
			}
		}
	}
}

export async function resolveRatePlanIdsForConditionScope(params: {
	scope: string
	scopeId: string
}): Promise<string[]> {
	const scope = String(params.scope ?? "").trim()
	const scopeId = String(params.scopeId ?? "").trim()
	if (!scope || !scopeId) return []
	if (scope === "rate_plan") return [scopeId]

	const rows =
		scope === "variant"
			? await db
					.select({ ratePlanId: RatePlan.id })
					.from(RatePlan)
					.where(eq(RatePlan.variantId, scopeId))
			: scope === "product"
				? await db
						.select({ ratePlanId: RatePlan.id })
						.from(RatePlan)
						.innerJoin(Variant, eq(Variant.id, RatePlan.variantId))
						.where(eq(Variant.productId, scopeId))
				: []
	return unique(rows.map((row) => row.ratePlanId))
}

export function fallbackRatePlanConditionsSummary(): RatePlanConditionsSummary {
	return fallbackSummary()
}
