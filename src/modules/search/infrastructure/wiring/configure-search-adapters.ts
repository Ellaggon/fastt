import { AdapterRegistry } from "../AdapterRegistry"
import { HotelAdapter } from "../adapters/HotelAdapter"
import { TourAdapter } from "../adapters/TourAdapter"
import type { SearchUnit } from "../../domain/unit.types"
import type { SellableUnitAdapterPort } from "../../application/ports/SellableUnitAdapterPort"

type AdapterDeps = ConstructorParameters<typeof HotelAdapter>[0]

/**
 * Registers hotel_room + tour_slot adapters on the shared sellable-unit registry.
 */
export function createSearchUnitAdapterRegistry(deps: AdapterDeps): AdapterRegistry<SearchUnit> {
	const registry = new AdapterRegistry<SearchUnit>()
	const hotel: SellableUnitAdapterPort<SearchUnit> = new HotelAdapter(deps)
	const tour: SellableUnitAdapterPort<SearchUnit> = new TourAdapter(deps)
	registry.register("hotel_room", hotel)
	registry.register("tour_slot", tour)
	return registry
}
