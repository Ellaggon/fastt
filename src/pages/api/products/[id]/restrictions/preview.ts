import type { APIRoute } from "astro"
import { RestrictionService } from "@/services/RestrictionService"

const service = new RestrictionService()

export const POST: APIRoute = async ({ request, params }) => {
	const body = await request.json()

	const preview = await service.preview(
		{
			productId: params.id!,
			checkIn: new Date(),
			checkOut: new Date(),
			nights: 1,
		},
		body
	)

	return new Response(JSON.stringify(preview), { status: 200 })
}
