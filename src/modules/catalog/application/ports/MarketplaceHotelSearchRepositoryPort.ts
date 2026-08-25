export type MarketplaceHotelCandidate = {
	productId: string
	name: string
	geoPlaceId: string
	heroImageUrl?: string | null
}

export interface MarketplaceHotelSearchRepositoryPort {
	listHotelsByGeoPlace(params: {
		geoPlaceIdOrSlug: string
		limit: number
	}): Promise<MarketplaceHotelCandidate[]>
}
