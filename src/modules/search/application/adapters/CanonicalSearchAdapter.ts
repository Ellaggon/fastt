import type {
	SearchEnginePort,
	SearchOffersInput,
	SearchOffersResult,
} from "../ports/SearchEnginePort"
import { resolveSearchOffers } from "../use-cases/resolve-search-offers"

export class CanonicalSearchAdapter implements SearchEnginePort {
	name = "canonical" as const

	run(input: SearchOffersInput): Promise<SearchOffersResult> {
		return resolveSearchOffers(input)
	}
}
