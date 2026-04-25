import type {
	SearchEnginePort,
	SearchOffersInput,
	SearchOffersResult,
} from "../ports/SearchEnginePort"
import type { SearchOffersRepositoryPort } from "../ports/SearchOffersRepository"
import { resolveNewSearchOffers } from "../use-cases/new-search-strategy"

export class NewSearchPipelineAdapter implements SearchEnginePort {
	name = "new" as const
	constructor(private readonly repo: SearchOffersRepositoryPort) {}

	run(input: SearchOffersInput): Promise<SearchOffersResult> {
		return resolveNewSearchOffers(input, { repo: this.repo })
	}
}
