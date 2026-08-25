export type GeoPlaceRow = {
	// We keep this shape open because the API returns the full DB row.
	// These fields are required for response formatting.
	name?: string | null
	slug?: string | null
	department?: string | null
	country?: string | null
	[key: string]: unknown
}

export interface GeoPlaceQueryRepositoryPort {
	search(params: { q: string; limit: number }): Promise<GeoPlaceRow[]>
	list(params: { limit: number }): Promise<GeoPlaceRow[]>
}
