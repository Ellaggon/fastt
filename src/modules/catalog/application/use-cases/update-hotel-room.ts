import type { HotelRoomQueryRepositoryPort } from "../ports/HotelRoomQueryRepositoryPort"

export async function updateHotelRoom(
	deps: { repo: HotelRoomQueryRepositoryPort },
	form: FormData,
	params: { hotelId: string }
): Promise<Response> {
	try {
		const hotelId = String(params.hotelId || form.get("hotelId"))
		const hotelRoomId = String(form.get("hotelRoomId") || "")
		const roomTypeId = String(form.get("roomTypeId") || "")

		if (!hotelRoomId || !hotelId || !roomTypeId) {
			return new Response(JSON.stringify({ error: "Missing IDs" }), { status: 400 })
		}

		const name = form.get("name") ? String(form.get("name")) : null
		const description = form.get("description") ? String(form.get("description")) : null
		const totalRooms = form.get("totalRooms") ? Number(form.get("totalRooms")) : 0
		const sizeM2 = form.get("sizeM2") ? Number(form.get("sizeM2")) : undefined
		const bathroom = form.get("bathroom") ? Number(form.get("bathroom")) : undefined
		const maxOccupancy = form.get("maxOccupancy") ? Number(form.get("maxOccupancy")) : undefined
		const hasBalcony = form.has("hasBalcony")
		const hasView = form.get("hasView") ? String(form.get("hasView")) : null
		const currency = form.get("currency") ? String(form.get("currency")) : "USD"

		const bedTypesRaw = form.get("bedTypes")
		const bedTypes = bedTypesRaw ? JSON.parse(String(bedTypesRaw)) : []

		const amenities = form.getAll("amenities").map((v) => String(v))

		const imagesRaw = form.get("images")
		const finalImages: string[] = imagesRaw ? JSON.parse(String(imagesRaw)) : []

		const basePriceRaw = form.get("basePrice")
		const basePrice = basePriceRaw ? Number(basePriceRaw) : null
		const isActive = form.has("isActive")

		await deps.repo.updateHotelRoom({
			hotelRoomId,
			totalRooms,
			sizeM2,
			bathroom,
			hasBalcony,
			hasView,
			maxOccupancyOverride: maxOccupancy,
			bedType: bedTypes.length ? bedTypes : null,
			variant: {
				name: name || "Habitación",
				description,
				currency,
				basePrice,
				isActive,
			},
			amenityIds: amenities,
			imageUrls: finalImages,
		})

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (e) {
		console.error("update room error: ", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
