import { SearchPipeline } from "@/modules/search/application/SearchPipeline"
import { SearchContextLoader } from "@/modules/search/application/SearchContextLoader"
import { searchAdapterRegistry } from "@/container"

async function run() {
	const loader = new SearchContextLoader(searchAdapterRegistry)
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
