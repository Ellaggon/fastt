import {
	resolveSearchOffers,
	type SearchOffersInput,
	type SearchOffersResult,
} from "./resolve-search-offers"
import type { SearchOffersRepositoryPort } from "../ports/SearchOffersRepository"

export async function resolveNewSearchOffers(
	input: SearchOffersInput,
	deps: { repo: SearchOffersRepositoryPort }
): Promise<SearchOffersResult> {
	// Convergence phase: keep adapter/strategy structure but preserve canonical semantics 1:1.
	return resolveSearchOffers(input, deps)
}
