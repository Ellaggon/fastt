import type { APIRoute } from "astro"
import { and, db, eq, HotelRoomAmenity, HotelRoomType, Image, Variant } from "astro:db"
import { getSession } from "auth-astro/server"

export const POST: APIRoute = async ({ request, params }) => {
	const session = await getSession(request)
	if (!session?.user?.email) {
		return new Response(JSON.stringify({ error: "Unautorized" }), { status: 401 })
	}

	try {
		const form = await request.formData()

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

		const bedTypesRaw = form.get("bedTypes")
		const bedTypes = bedTypesRaw ? JSON.parse(String(bedTypesRaw)) : []

		const amenities = form.getAll("amenities").map((v) => String(v))

		const imagesRaw = form.get("images")
		const finalImages: string[] = imagesRaw ? JSON.parse(String(imagesRaw)) : []

		await db
			.update(HotelRoomType)
			.set({
				totalRooms,
				sizeM2,
				bathroom,
				hasBalcony,
				hasView,
				maxOccupancyOverride: maxOccupancy,
				bedType: bedTypes.length ? bedTypes : null,
			})
			.where(eq(HotelRoomType.id, hotelRoomId))

		const variant = await db.select().from(Variant).where(eq(Variant.entityId, hotelRoomId)).get()

		if (variant) {
			const basePriceUSD = form.get("basePriceUSD")
				? Number(form.get("basePriceUSD"))
				: variant.basePriceUSD
			const basePriceBOB = form.get("basePriceBOB")
				? Number(form.get("basePriceBOB"))
				: variant.basePriceBOB
			const isActive = form.has("isActive")

			await db
				.update(Variant)
				.set({
					name: name || "Habitación",
					description,
					basePriceUSD,
					basePriceBOB,
					isActive,
				})
				.where(eq(Variant.id, variant.id))
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

		await db
			.delete(Image)
			.where(and(eq(Image.entityType, "HotelRoomType"), eq(Image.entityId, hotelRoomId)))

		if (finalImages.length > 0) {
			await db.insert(Image).values(
				finalImages.map((url, idx) => ({
					id: crypto.randomUUID(),
					entityType: "HotelRoomType",
					entityId: hotelRoomId,
					url,
					order: idx,
					isPrimary: idx === 0,
				}))
			)
		}

		return new Response(JSON.stringify({ ok: true }), { status: 200 })
	} catch (e) {
		console.error("update room error: ", e)
		return new Response(JSON.stringify({ error: "Server error" }), { status: 500 })
	}
}
