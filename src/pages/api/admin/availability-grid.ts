import { AvailabilityGridEngine } from "@/core/availability/AvailabilityGridEngine"
import { globalAdapterRegistry } from "@/core/search/adapters/adapter.globalRegistry"
import { SearchContextLoader } from "@/core/search/SearchContextLoader"
import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ url }) => {
	const loader = new SearchContextLoader(globalAdapterRegistry)

	const memory = await loader.load({
		productId: url.searchParams.get("productId")!,
		unitId: url.searchParams.get("variantId")!,
		unitType: "hotel_room",
		checkIn: new Date(url.searchParams.get("from")!),
		checkOut: new Date(url.searchParams.get("to")!),
		adults: 1,
		children: 0,
		basePrice: 0,
	})

	const engine = new AvailabilityGridEngine()

	const grid = engine.buildGridFromMemory(
		memory.inventory,
		new Date(url.searchParams.get("from")!),
		new Date(url.searchParams.get("to")!)
	)

	return new Response(JSON.stringify(grid))
}
