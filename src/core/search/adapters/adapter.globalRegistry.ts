import { AdapterRegistry } from "./adapter.registry"
import { HotelAdapter } from "./adapter.hotel"

const registry = new AdapterRegistry()

registry.register("hotel_room", new HotelAdapter())

// futuro:
/// registry.register("tour_slot", new TourAdapter())
// registry.register("package_base", new PackageAdapter())

export const globalAdapterRegistry = registry
