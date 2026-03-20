import { AvailabilityGridEngine } from "@/shared/domain/availability/AvailabilityGridEngine"
import { searchAdapterRegistry } from "@/container"
import { SearchContextLoader } from "@/modules/search/public"
import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ url }) => {
	const loader = new SearchContextLoader(searchAdapterRegistry)

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

	const inventoryForGrid = memory.inventory.filter(
		(d): d is { date: string; totalInventory: number; reservedCount: number; stopSell?: boolean } =>
			typeof d.date === "string"
	)

	const grid = engine.buildGridFromMemory(
		inventoryForGrid,
		new Date(url.searchParams.get("from")!),
		new Date(url.searchParams.get("to")!)
	)

	return new Response(JSON.stringify(grid))
}
