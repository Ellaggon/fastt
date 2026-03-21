export type DestinationRow = {
	// We keep this shape open because the API returns the full DB row.
	// These fields are required for response formatting.
	name?: string | null
	slug?: string | null
	department?: string | null
	country?: string | null
	[key: string]: unknown
}

export interface DestinationQueryRepositoryPort {
	search(params: { q: string; limit: number }): Promise<DestinationRow[]>
	list(params: { limit: number }): Promise<DestinationRow[]>
}
