// src/pages/api/products/[hotelId]/rooms/create.ts
import type { APIRoute } from "astro"
import { db, HotelRoomType, Hotel, HotelRoomAmenity, Image, eq, and } from "astro:db"
import { getSession } from "auth-astro/server"

export const POST: APIRoute = async ({ request, params }) => {
	const hotelIdParam = String(params.hotelId || "")
	const session = await getSession(request)
	const email = session?.user?.email

	if (!email) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })

	try {
		const form = await request.formData()

		const hotelId = String(form.get("hotelId") || hotelIdParam)
		const roomTypeId = String(form.get("roomTypeId") || "")

		const maxOccupancy = form.get("maxOccupancy") ? Number(form.get("maxOccupancy")) : undefined
		const bedTypesRaw = form.get("bedTypes")
		const bedTypes = bedTypesRaw ? JSON.parse(String(bedTypesRaw)) : []
		// const bedTypes = form.getAll("bedTypes").map(String); // <-- array real
		const sizeM2 = form.get("sizeM2") ? Number(form.get("sizeM2")) : undefined
		const bathroom = form.get("bathroom") ? Number(form.get("bathroom")) : undefined
		const hasBalcony = form.has("hasBalcony")
		const totalRooms = form.get("totalRooms") ? Number(form.get("totalRooms")) : 0
		const priceUSD = form.get("priceUSD") ? Number(form.get("priceUSD")) : null
		const priceBOB = form.get("priceBOB") ? Number(form.get("priceBOB")) : null
		const hasView = form.get("hasView") ? String(form.get("hasView")) : null

		//overrides
		const name = form.get("name") ? String(form.get("name")) : null
		const description = form.get("description") ? String(form.get("description")) : null

		const amenities = form.getAll("amenities").map((v) => String(v))
		const images = JSON.parse(String(form.get("images") || "[]")) as string[]

		if (!hotelId || !roomTypeId) {
			return new Response(JSON.stringify({ error: "Missing hotelId or roomTypeId" }), {
				status: 400,
			})
		}

		const hotelRow = await db.select().from(Hotel).where(eq(Hotel.productId, hotelId)).get()
		if (!hotelRow)
			return new Response(JSON.stringify({ error: "Hotel not found" }), { status: 404 })

		console.log("HotelId recibido:", hotelId)
		console.log("RoomTypeId recibido:", roomTypeId)
		console.log("Hotel encontrado:", hotelRow)

		const exists = await db
			.select()
			.from(HotelRoomType)
			.where(and(eq(HotelRoomType.hotelId, hotelId), eq(HotelRoomType.roomTypeId, roomTypeId)))
			.get()

		let hotelRoomId: string

		if (exists) {
			hotelRoomId = exists.id

			await db
				.update(HotelRoomType)
				.set({
					totalRooms,
					priceUSD,
					priceBOB,
					hasView,
					maxOccupancyOverride: maxOccupancy,
					bedType: bedTypes.length ? JSON.stringify(bedTypes) : null,
					sizeM2,
					bathroom,
					hasBalcony,
				})
				.where(eq(HotelRoomType.id, exists.id))
		} else {
			hotelRoomId = crypto.randomUUID()

			await db.insert(HotelRoomType).values({
				id: hotelRoomId,
				hotelId,
				roomTypeId,
				totalRooms,
				priceUSD,
				priceBOB,
				hasView,
				name,
				description,
				maxOccupancyOverride: maxOccupancy,
				bedType: bedTypes.length ? bedTypes : null,
				sizeM2,
				bathroom,
				hasBalcony,
			})
		}

		await db.delete(HotelRoomAmenity).where(eq(HotelRoomAmenity.hotelRoomTypeId, hotelRoomId))

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
			await db
				.delete(Image)
				.where(and(eq(Image.entityType, "HotelRoomType"), eq(Image.entityId, hotelRoomId)))

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

		return new Response(JSON.stringify({ ok: true, id: hotelRoomId }), { status: 200 })
	} catch (err) {
		console.error("rooms/create error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
