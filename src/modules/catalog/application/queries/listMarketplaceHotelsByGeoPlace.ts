import type { MarketplaceHotelSearchRepositoryPort } from "../ports/MarketplaceHotelSearchRepositoryPort"

export function createListMarketplaceHotelsByGeoPlaceQuery(deps: {
	repo: MarketplaceHotelSearchRepositoryPort
}) {
	return async function listMarketplaceHotelsByGeoPlace(params: {
		geoPlaceId: string
		limit?: number
	}) {
		const geoPlaceIdOrSlug = String(params.geoPlaceId ?? "").trim()
		const limit = Math.min(Math.max(1, Number(params.limit ?? 50)), 200)
		if (!geoPlaceIdOrSlug) return []

		return deps.repo.listHotelsByGeoPlace({ geoPlaceIdOrSlug, limit })
	}
}
