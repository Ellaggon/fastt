// export interface AvailabilityParams {
// 	productId: string
// 	checkIn: string | null
// 	checkOut: string | null
// 	adults: number
// 	children: number
// }

// export async function fetchAvailability({
// 	productId,
// 	checkIn,
// 	checkOut,
// 	adults,
// 	children,
// }: AvailabilityParams) {
// 	const res = await fetch("/api/search", {
// 		method: "POST",
// 		headers: { "Content-Type": "application/json" },
// 		body: JSON.stringify({
// 			productId,
// 			checkIn,
// 			checkOut,
// 			adults,
// 			children,
// 			currency: "USD",
// 		}),
// 	})

// 	if (!res.ok) {
// 		throw new Error("Error fetching availability")
// 	}

// 	return res.json()
// }
