import { AvailabilityGridEngine } from "@/shared/domain/availability/AvailabilityGridEngine"
import { searchContextLoader } from "@/container"
import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ url }) => {
	const productId = url.searchParams.get("productId")
	const variantId = url.searchParams.get("variantId")
	const from = url.searchParams.get("from")
	const to = url.searchParams.get("to")

	if (!productId || !variantId || !from || !to) {
		return new Response(
			JSON.stringify({ error: "Missing query params: productId, variantId, from, to" }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			}
		)
	}

	const fromDate = new Date(from)
	const toDate = new Date(to)
	if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
		return new Response(JSON.stringify({ error: "Invalid date params: from/to" }), {
			status: 400,
			headers: { "Content-Type": "application/json" },
		})
	}

	const memory = await searchContextLoader.load({
		productId,
		unitId: variantId,
		unitType: "hotel_room",
		checkIn: fromDate,
		checkOut: toDate,
		adults: 1,
		children: 0,
		basePrice: 0,
	})

	const engine = new AvailabilityGridEngine()

	const inventoryForGrid = memory.inventory.filter(
		(d): d is { date: string; totalInventory: number; reservedCount: number; stopSell?: boolean } =>
			typeof d.date === "string"
	)

	const grid = engine.buildGridFromMemory(inventoryForGrid, fromDate, toDate)

	return new Response(JSON.stringify(grid))
}
