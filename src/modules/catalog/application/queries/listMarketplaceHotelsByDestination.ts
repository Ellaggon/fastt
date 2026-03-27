import type { MarketplaceHotelSearchRepositoryPort } from "../ports/MarketplaceHotelSearchRepositoryPort"

export function createListMarketplaceHotelsByDestinationQuery(deps: {
	repo: MarketplaceHotelSearchRepositoryPort
}) {
	return async function listMarketplaceHotelsByDestination(params: {
		destinationId: string
		limit?: number
	}) {
		const destinationIdOrSlug = String(params.destinationId ?? "").trim()
		const limit = Math.min(Math.max(1, Number(params.limit ?? 50)), 200)
		if (!destinationIdOrSlug) return []

		return deps.repo.listHotelsByDestination({ destinationIdOrSlug, limit })
	}
}
