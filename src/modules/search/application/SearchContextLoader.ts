import type { SearchContext } from "./ports/SellableUnitAdapterPort"
import type { AdapterRegistryPort } from "./ports/AdapterRegistryPort"
import type { ISearchContextLoader } from "./SearchPipeline"
import type { SellableUnit } from "../domain/unit.types"

export class SearchContextLoader<TUnit extends SellableUnit = SellableUnit>
	implements ISearchContextLoader<TUnit>
{
	constructor(private adapterRegistry: AdapterRegistryPort<TUnit>) {}

	async load(ctx: SearchContext<TUnit>) {
		const adapter = this.adapterRegistry.get(ctx.unitType)

		const inventory = await adapter.loadInventory(ctx)
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
