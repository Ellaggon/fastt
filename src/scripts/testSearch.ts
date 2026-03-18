import { SearchPipeline } from "@/core/search/SearchPipeline"
import { SearchContextLoader } from "@/core/search/SearchContextLoader"
import { globalAdapterRegistry } from "@/core/search/adapters/adapter.globalRegistry"

async function run() {
	const loader = new SearchContextLoader(globalAdapterRegistry)
	const pipeline = new SearchPipeline(loader)

	const result = await pipeline.run({
		productId: "YOUR_PRODUCT_ID",
		unitId: "YOUR_VARIANT_ID",
		unitType: "hotel_room",
		checkIn: new Date("2026-03-10"),
		checkOut: new Date("2026-03-13"),
		adults: 2,
		children: 0,
		basePrice: 100,
	})

	console.log(JSON.stringify(result, null, 2))
}

run()
