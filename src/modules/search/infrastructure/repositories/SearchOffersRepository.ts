import { variantRepository } from "@/container/pricing.container"
import { searchReadModelRepository } from "@/container/search-read-model.container"
import type { SearchUnit } from "@/modules/search/public"
import { isUnitType } from "@/modules/search/domain/unit.types"
import type {
	SearchOffersRepositoryPort,
	SearchUnitViewRow,
} from "@/modules/search/application/ports/SearchOffersRepository"

export class SearchOffersRepository implements SearchOffersRepositoryPort {
	async listActiveUnitsByProduct(productId: string): Promise<SearchUnit[]> {
		const rows = await variantRepository.getActiveByProduct(productId)
		return rows
			.map((variant) => ({
				id: variant.id,
				productId: variant.productId,
				kind: variant.kind,
				pricing: variant.pricing,
				capacity: variant.capacity,
			}))
			.filter((unit) => isUnitType(unit.kind))
	}

	async listSearchUnitViewRows(params: {
		unitIds: string[]
		from: string
		to: string
		occupancyKey: string
	}): Promise<SearchUnitViewRow[]> {
		return searchReadModelRepository.listSearchUnitViewRows(params)
	}
}
