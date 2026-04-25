import {
	resolveSearchOffers,
	type SearchOffersInput,
	type SearchOffersResult,
} from "./resolve-search-offers"

export async function resolveNewSearchOffers(
	input: SearchOffersInput
): Promise<SearchOffersResult> {
	// Convergence phase: keep adapter/strategy structure but preserve canonical semantics 1:1.
	return resolveSearchOffers(input)
}
