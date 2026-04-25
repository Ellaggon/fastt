import { cacheKeys, cacheTtls } from "@/lib/cache/cacheKeys"
import { readThrough } from "@/lib/cache/readThrough"
import type {
	CatalogReadModelRepositoryPort,
	ProviderBookingsAggregate,
	ProviderBookingsAggregateInput,
	ProviderBookingSummaryItem,
} from "../ports/CatalogReadModelRepositoryPort"

export type {
	ProviderBookingsAggregateInput,
	ProviderBookingSummaryItem,
	ProviderBookingsAggregate,
}

export function createGetProviderBookingsAggregateQuery(deps: {
	repo: CatalogReadModelRepositoryPort
}) {
	return async function getProviderBookingsAggregate(
		input: ProviderBookingsAggregateInput
	): Promise<ProviderBookingsAggregate> {
		const providerId = String(input.providerId ?? "").trim()
		if (!providerId) return { items: [] }

		const status = String(input.status ?? "all")
			.trim()
			.toLowerCase()
		const from = String(input.from ?? "").trim()
		const to = String(input.to ?? "").trim()
		const normalizedStatus = status || "all"
		const normalizedFrom = from || "any"
		const normalizedTo = to || "any"

		return readThrough(
			cacheKeys.providerBookingsSummary(providerId, normalizedStatus, normalizedFrom, normalizedTo),
			cacheTtls.providerBookingsSummary,
			async () =>
				deps.repo.getProviderBookingsAggregate({
					providerId,
					status,
					from,
					to,
				})
		)
	}
}
