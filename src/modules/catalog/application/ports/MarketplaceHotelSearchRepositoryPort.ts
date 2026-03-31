export type MarketplaceHotelCandidate = {
	productId: string
	name: string
	destinationId: string
	heroImageUrl?: string | null
}

export interface MarketplaceHotelSearchRepositoryPort {
	listHotelsByDestination(params: {
		destinationIdOrSlug: string
		limit: number
	}): Promise<MarketplaceHotelCandidate[]>
}
