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
import { listPolicyCoverageByProvider, REQUIRED_POLICY_CATEGORIES } from "@/modules/policies/public"

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
}

const DEFAULT_CHANNEL = "web"
const STATE_MAX_AGE_MS = Number(
	process.env.FASTT_RATE_PLAN_CONDITION_STATE_MAX_AGE_MS ?? 30 * 60 * 1000
)

function unique(values: readonly unknown[]): string[] {
	return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10)
}

function stateId(ratePlanId: string, channel = DEFAULT_CHANNEL): string {
	return `${ratePlanId}:${channel || DEFAULT_CHANNEL}`
}

function asMissingCategories(value: unknown): string[] {
	if (!Array.isArray(value)) return [...REQUIRED_POLICY_CATEGORIES]
	return value.map((item) => String(item ?? "").trim()).filter(Boolean)
}

function summaryForMissing(missingCategories: readonly string[]): string {
	if (!missingCategories.length) return "Condiciones completas"
	return `Faltan condiciones: ${missingCategories.join(", ")}`
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
			totalCategories: RatePlanConditionState.totalCategories,
			coveredCategories: RatePlanConditionState.coveredCategories,
			missingCategoriesJson: RatePlanConditionState.missingCategoriesJson,
			conditionsComplete: RatePlanConditionState.conditionsComplete,
			summary: RatePlanConditionState.summary,
			policyCoverageUpdatedAt: RatePlanConditionState.policyCoverageUpdatedAt,
			updatedAt: RatePlanConditionState.updatedAt,
		})
		.from(RatePlanConditionState)
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
		const missingCategories = asMissingCategories(row.missingCategoriesJson)
		result.set(ratePlanId, {
			conditionsComplete: Boolean(row.conditionsComplete),
			totalCategories: Number(row.totalCategories ?? REQUIRED_POLICY_CATEGORIES.length),
			coveredCategories: Number(row.coveredCategories ?? 0),
			missingCategories,
			policyCoverageUpdatedAt: row.policyCoverageUpdatedAt ?? null,
			summary: String(row.summary ?? summaryForMissing(missingCategories)),
		})
	}

	const staleOrMissing = ids.filter((id) => !result.has(id))
	if (staleOrMissing.length) {
		void refreshRatePlanConditionStates({ ratePlanIds: staleOrMissing, channel }).catch(() => {})
	}
	for (const row of rows) {
		if (!isFresh(row.updatedAt)) {
			void refreshRatePlanConditionStates({ ratePlanIds: [String(row.ratePlanId)], channel }).catch(
				() => {}
			)
		}
	}

	return result
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
	}))
	if (!normalizedContexts.length) return

	const requestedIds = new Set(normalizedContexts.map((row) => row.ratePlanId))
	const providers = unique(normalizedContexts.map((row) => row.providerId))
	const now = new Date()

	for (const providerId of providers) {
		const coverageRows = await listPolicyCoverageByProvider({
			providerId,
			asOfDate: todayIso(),
			channel,
			requiredCategories: REQUIRED_POLICY_CATEGORIES,
		})
		for (const coverage of coverageRows) {
			const ratePlanId = String(coverage.ratePlanId)
			if (!requestedIds.has(ratePlanId)) continue
			const context = normalizedContexts.find((row) => row.ratePlanId === ratePlanId)
			if (!context) continue
			const missingCategories = coverage.missingCategories
			await db
				.insert(RatePlanConditionState)
				.values({
					id: stateId(ratePlanId, channel),
					ratePlanId,
					providerId: context.providerId,
					productId: context.productId,
					variantId: context.variantId,
					channel,
					totalCategories: REQUIRED_POLICY_CATEGORIES.length,
					coveredCategories: coverage.coveredCategories.length,
					missingCategoriesJson: missingCategories,
					conditionsComplete: coverage.isComplete,
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
						totalCategories: REQUIRED_POLICY_CATEGORIES.length,
						coveredCategories: coverage.coveredCategories.length,
						missingCategoriesJson: missingCategories,
						conditionsComplete: coverage.isComplete,
						summary: summaryForMissing(missingCategories),
						policyCoverageUpdatedAt: now,
						updatedAt: now,
					},
				})
				.catch(() => undefined)
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
