import type { SearchOffersInput, SearchOffersResult } from "../use-cases/resolve-search-offers"

export type SearchEngineName = "canonical" | "new"
export type { SearchOffersInput, SearchOffersResult } from "../use-cases/resolve-search-offers"

export interface SearchEnginePort {
	name: SearchEngineName
	run(input: SearchOffersInput): Promise<SearchOffersResult>
}
