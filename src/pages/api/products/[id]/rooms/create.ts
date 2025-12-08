import type { APIRoute } from "astro"
import { db, HotelRoomType, Hotel, HotelRoomAmenity, Image, Variant, eq } from "astro:db"
import { getSession } from "auth-astro/server"

export const POST: APIRoute = async ({ request, params }) => {
	const hotelIdParam = String(params.hotelId || "")
	const session = await getSession(request)
	const email = session?.user?.email

	if (!email) {
		return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
	}

	try {
		const form = await request.formData()

		const hotelId = String(form.get("hotelId") || hotelIdParam)
		const roomTypeId = String(form.get("roomTypeId") || "")

		if (!hotelId || !roomTypeId) {
			return new Response(JSON.stringify({ error: "Missing hotelId or roomTypeId" }), {
				status: 400,
			})
		}

		const maxOccupancy = form.get("maxOccupancy") ? Number(form.get("maxOccupancy")) : undefined
		const bedTypesRaw = form.get("bedTypes")
		const bedTypes = bedTypesRaw ? JSON.parse(String(bedTypesRaw)) : []
		const sizeM2 = form.get("sizeM2") ? Number(form.get("sizeM2")) : undefined
		const bathroom = form.get("bathroom") ? Number(form.get("bathroom")) : undefined
		const hasBalcony = form.has("hasBalcony")
		const totalRooms = form.get("totalRooms") ? Number(form.get("totalRooms")) : 0
		const hasView = form.get("hasView") ? String(form.get("hasView")) : null

		const name = form.get("name") ? String(form.get("name")) : "Habitación"
		const description = form.get("description") ? String(form.get("description")) : null

		const amenities = form.getAll("amenities").map((v) => String(v))
		const images = JSON.parse(String(form.get("images") || "[]")) as string[]

		const basePriceUSD = form.get("basePriceUSD") ? Number(form.get("basePriceUSD")) : 0
		const basePriceBOB = form.get("basePriceBOB") ? Number(form.get("basePriceBOB")) : 0

		const hotelRow = await db.select().from(Hotel).where(eq(Hotel.productId, hotelId)).get()

		if (!hotelRow) {
			return new Response(JSON.stringify({ error: "Hotel not found" }), { status: 404 })
		}

		const hotelRoomId = crypto.randomUUID()
		const variantId = crypto.randomUUID()

		await db.insert(HotelRoomType).values({
			id: hotelRoomId,
			hotelId,
			roomTypeId,
			totalRooms,
			hasView,
			maxOccupancyOverride: maxOccupancy,
			bedType: bedTypes.length ? bedTypes : null,
			sizeM2,
			bathroom,
			hasBalcony,
		})

		await db.insert(Variant).values({
			id: variantId,
			productId: hotelId,
			entityType: "hotel_room",
			entityId: hotelRoomId,
			name,
			description,
			basePriceUSD,
			basePriceBOB,
			isActive: true,
		})

		if (amenities.length > 0) {
			await db.insert(HotelRoomAmenity).values(
				amenities.map((amenityId) => ({
					id: crypto.randomUUID(),
					hotelRoomTypeId: hotelRoomId,
					amenityId,
					isAvailable: true,
				}))
			)
		}

		if (images.length > 0) {
			await db.insert(Image).values(
				images.map((url, idx) => ({
					id: crypto.randomUUID(),
					entityType: "HotelRoomType",
					entityId: hotelRoomId,
					url,
					order: idx,
					isPrimary: idx === 0,
				}))
			)
		}

		return new Response(JSON.stringify({ ok: true, id: hotelRoomId, variantId }), { status: 200 })
	} catch (err) {
		console.error("rooms/create error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
