import type { APIRoute } from "astro"
import { getSession } from "auth-astro/server"
import { updateHotelRoom } from "@/modules/catalog/application/use-cases/update-hotel-room"

export const POST: APIRoute = async ({ request, params }) => {
	const session = await getSession(request)
	if (!session?.user?.email) {
		return new Response(JSON.stringify({ error: "Unautorized" }), { status: 401 })
	}

	const form = await request.formData()
	return updateHotelRoom(form, { hotelId: String((params as any).hotelId || "") })
}
