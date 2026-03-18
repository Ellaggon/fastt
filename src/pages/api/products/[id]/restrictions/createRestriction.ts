import type { APIRoute } from "astro"
import { restrictionService as service } from "@/container"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	await service.create(body)

	return new Response("ok")
}
