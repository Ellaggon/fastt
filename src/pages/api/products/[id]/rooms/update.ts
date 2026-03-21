import type { APIRoute } from "astro"
import { updateHotelRoom } from "@/modules/catalog/public"
import { hotelRoomRepository } from "@/container"
import { requireAuth } from "@/lib/auth/requireAuth"

export const POST: APIRoute = async ({ request, params }) => {
	try {
		await requireAuth(request, {
			unauthorizedResponse: new Response(JSON.stringify({ error: "Unautorized" }), { status: 401 }),
		})
	} catch (e) {
		if (e instanceof Response) return e
		throw e
	}

	const form = await request.formData()
	return updateHotelRoom({ repo: hotelRoomRepository }, form, {
		hotelId: String((params as any).hotelId || ""),
	})
}
