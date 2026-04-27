import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import { variantRepository } from "./pricing.container"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { type FeatureFlagContext } from "@/config/featureFlags"
import { CanonicalSearchAdapter } from "@/modules/search/application/adapters/CanonicalSearchAdapter"
import { NewSearchPipelineAdapter } from "@/modules/search/application/adapters/NewSearchPipelineAdapter"
import type { SearchOffersInput } from "@/modules/search/application/ports/SearchEnginePort"
import { SearchRuntimeOrchestrator } from "@/modules/search/application/services/SearchRuntimeOrchestrator"
import { SearchOffersRepository } from "@/modules/search/infrastructure/repositories/SearchOffersRepository"

const autoBackfillInFlight = new Set<string>()

const searchOffersRepository = new SearchOffersRepository()
const canonicalSearchEngine = new CanonicalSearchAdapter(searchOffersRepository)
const newSearchEngine = new NewSearchPipelineAdapter(searchOffersRepository)

function resolveCurrency(params: {
	currency?: string
	featureContext?: FeatureFlagContext & { requestId?: string }
}): string {
	const explicit = String(params.currency ?? "")
		.trim()
		.toUpperCase()
	if (/^[A-Z]{3}$/.test(explicit)) return explicit
	const queryCurrency =
		params.featureContext?.query instanceof URLSearchParams
			? params.featureContext.query.get("currency")
			: undefined
	const queryNormalized = String(queryCurrency ?? "")
		.trim()
		.toUpperCase()
	if (/^[A-Z]{3}$/.test(queryNormalized)) return queryNormalized
	const headerCurrency =
		params.featureContext?.request?.headers.get("x-currency") ??
		(params.featureContext?.headers instanceof Headers
			? params.featureContext.headers.get("x-currency")
			: undefined)
	const headerNormalized = String(headerCurrency ?? "")
		.trim()
		.toUpperCase()
	if (/^[A-Z]{3}$/.test(headerNormalized)) return headerNormalized
	return "USD"
}

async function getActiveUnitsByProduct(productId: string): Promise<SearchUnit[]> {
	const rows = await variantRepository.getActiveByProduct(productId)
	return rows
		.map((v) => ({
			id: v.id,
			productId: v.productId,
			kind: v.kind,
			pricing: v.pricing,
			capacity: v.capacity,
		}))
		.filter((unit) => unit.id && unit.productId)
}

function enqueueAutoBackfill(params: {
	productId: string
	from: string
	to: string
	reason: string
}): void {
	if (process.env.SEARCH_VIEW_AUTO_BACKFILL === "false") return
	const key = `${params.productId}:${params.from}:${params.to}`
	if (autoBackfillInFlight.has(key)) return
	autoBackfillInFlight.add(key)

	queueMicrotask(async () => {
		try {
			const units = await getActiveUnitsByProduct(params.productId)
			const { materializeSearchUnitRange } = await import("@/modules/search/public")
			let rows = 0
			for (const unit of units) {
				const result = await materializeSearchUnitRange({
					variantId: unit.id,
					from: params.from,
					to: params.to,
					currency: "USD",
				})
				rows += Number(result.rows ?? 0)
			}
			incrementCounter("search_view_autobackfill_success_total", {
				endpoint: "searchOffers",
				reason: params.reason,
			})
			logger.info("search.view.autobackfill.completed", {
				productId: params.productId,
				from: params.from,
				to: params.to,
				reason: params.reason,
				variantCount: units.length,
				rows,
			})
		} catch (error) {
			incrementCounter("search_view_autobackfill_error_total", {
				endpoint: "searchOffers",
				reason: params.reason,
			})
			logger.warn("search.view.autobackfill.failed", {
				productId: params.productId,
				from: params.from,
				to: params.to,
				reason: params.reason,
				message: error instanceof Error ? error.message : String(error),
			})
		} finally {
			autoBackfillInFlight.delete(key)
		}
	})
}

const searchRuntimeOrchestrator = new SearchRuntimeOrchestrator({
	primaryEngine: newSearchEngine,
	shadowEngine: canonicalSearchEngine,
	enqueueAutoBackfill,
})

export async function searchOffers(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
	debug?: boolean
	currency?: string
	featureContext?: FeatureFlagContext & { requestId?: string }
}): Promise<SearchOffer<SearchUnit>[]> {
	const requestId = String(params.featureContext?.requestId ?? "search-anon")
	const currency = resolveCurrency(params)
	const input: SearchOffersInput = {
		...params,
		currency,
	}

	return searchRuntimeOrchestrator.executeSearchOffers({
		input,
		productId: params.productId,
		checkIn: params.checkIn,
		checkOut: params.checkOut,
		debug: params.debug,
		featureContext: params.featureContext,
		requestId,
	})
}

export async function searchOffersDebug(params: {
	productId: string
	checkIn: Date
	checkOut: Date
	rooms?: number
	adults: number
	children: number
}): Promise<{
	offers: SearchOffer<SearchUnit>[]
	unsellable: Array<{
		variantId: string
		ratePlanId: string
		primaryBlocker: string
	}>
}> {
	const result = await canonicalSearchEngine.run({ ...params, debug: true })
	return {
		offers: result.offers,
		unsellable: result.debugUnsellable ?? [],
	}
}

export { canonicalSearchEngine }
