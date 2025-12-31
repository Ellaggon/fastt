import type { APIRoute } from "astro"
import { checkAvailability } from "@/core/availability/availability.service"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const result = await checkAvailability(body)

	return new Response(JSON.stringify(result), {
		status: 200,
	})
}
