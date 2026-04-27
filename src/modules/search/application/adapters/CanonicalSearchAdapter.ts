import type {
	SearchEnginePort,
	SearchOffersInput,
	SearchOffersResult,
} from "../ports/SearchEnginePort"
import type { SearchOffersRepositoryPort } from "../ports/SearchOffersRepository"
import { resolveSearchOffers } from "../use-cases/resolve-search-offers"

export class CanonicalSearchAdapter implements SearchEnginePort {
	name = "canonical" as const
	constructor(private readonly repo: SearchOffersRepositoryPort) {}

	run(input: SearchOffersInput): Promise<SearchOffersResult> {
		return resolveSearchOffers(input, { repo: this.repo })
	}
}
