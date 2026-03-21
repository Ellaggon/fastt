import type { APIRoute } from "astro"

import { createRoomUseCase } from "@/container"
import { requireAuth } from "@/lib/auth/requireAuth"

export const POST: APIRoute = async ({ request, params }) => {
	const hotelIdParam = String(params.hotelId || "")
	try {
		await requireAuth(request, {
			unauthorizedResponse: new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			}),
		})
	} catch (e) {
		if (e instanceof Response) return e
		throw e
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

		const currency = form.get("currency") ? String(form.get("currency")) : "USD"

		const basePrice = form.get("basePrice") ? Number(form.get("basePrice")) : 0

		const result = await createRoomUseCase({
			hotelId,
			roomTypeId,
			totalRooms,
			hasView,
			maxOccupancyOverride: maxOccupancy,
			bedTypes,
			sizeM2,
			bathroom,
			hasBalcony,
			name,
			description,
			currency,
			basePrice,
			amenityIds: amenities,
			imageUrls: images,
		})

		if (!result.ok) {
			return new Response(JSON.stringify({ error: result.error }), { status: result.status })
		}

		return new Response(
			JSON.stringify({ ok: true, id: result.hotelRoomId, variantId: result.variantId }),
			{
				status: 201,
			}
		)
	} catch (err) {
		console.error("rooms/create error:", err)
		return new Response(JSON.stringify({ error: "Server error" }), {
			status: 500,
		})
	}
}
