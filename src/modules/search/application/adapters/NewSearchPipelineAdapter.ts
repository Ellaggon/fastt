import type {
	SearchEnginePort,
	SearchOffersInput,
	SearchOffersResult,
} from "../ports/SearchEnginePort"
import { resolveNewSearchOffers } from "../use-cases/new-search-strategy"

export class NewSearchPipelineAdapter implements SearchEnginePort {
	name = "new" as const

	run(input: SearchOffersInput): Promise<SearchOffersResult> {
		return resolveNewSearchOffers(input)
	}
}
