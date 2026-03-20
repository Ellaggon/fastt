import { searchPipeline } from "@/container"

async function run() {
	const result = await searchPipeline.run({
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
