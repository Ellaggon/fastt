import type { APIRoute } from "astro"
import { RestrictionService } from "@/services/RestrictionService"

const service = new RestrictionService()

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	await service.create(body)

	return new Response("ok")
}
