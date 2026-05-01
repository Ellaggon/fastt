import type { SearchOffer, SearchUnit } from "@/modules/search/public"
import { logger } from "@/lib/observability/logger"
import { incrementCounter } from "@/lib/observability/metrics"
import { type FeatureFlagContext } from "@/config/featureFlags"
import { CanonicalSearchAdapter } from "@/modules/search/application/adapters/CanonicalSearchAdapter"
import { NewSearchPipelineAdapter } from "@/modules/search/application/adapters/NewSearchPipelineAdapter"
import type { SearchOffersInput } from "@/modules/search/application/ports/SearchEnginePort"
import { SearchRuntimeOrchestrator } from "@/modules/search/application/services/SearchRuntimeOrchestrator"
import { SearchOffersRepository } from "@/modules/search/infrastructure/repositories/SearchOffersRepository"

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

function reportBackfillCandidate(params: {
	productId: string
	from: string
	to: string
	reason: string
}): void {
	incrementCounter("search_view_backfill_candidate_total", {
		endpoint: "searchOffers",
		reason: params.reason,
	})
	logger.warn("search.view.backfill_candidate_detected", {
		productId: params.productId,
		from: params.from,
		to: params.to,
		reason: params.reason,
	})
}

const searchRuntimeOrchestrator = new SearchRuntimeOrchestrator({
	primaryEngine: newSearchEngine,
	shadowEngine: canonicalSearchEngine,
	reportBackfillCandidate,
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
