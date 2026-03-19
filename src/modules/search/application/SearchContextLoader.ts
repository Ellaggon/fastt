import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { AdapterRegistryPort } from "./ports/AdapterRegistryPort"
import type { ISearchContextLoader } from "./SearchPipeline"

export class SearchContextLoader implements ISearchContextLoader {
	constructor(private adapterRegistry: AdapterRegistryPort) {}

	async load(ctx: SearchContext) {
		const adapter = this.adapterRegistry.get(ctx.unitType)

		// const inventory = await adapter.loadInventory(ctx)
		const inventory = (await adapter.loadInventory(ctx)).map((i) => ({
			...i,
			date: new Date(i.date),
		}))
		const ratePlans = await adapter.loadRatePlans(ctx)
		const priceRules = await adapter.loadPriceRules(ctx)
		const restrictions = await adapter.loadRestrictions(ctx)
		const promotions = await adapter.loadPromotions(ctx)

		return {
			inventory,
			ratePlans,
			priceRules,
			restrictions,
			promotions,
		}
	}
}
