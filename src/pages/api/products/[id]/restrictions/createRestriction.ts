import type { APIRoute } from "astro"
import { createRestrictionViaService } from "@/modules/catalog/application/use-cases/create-restriction-via-service"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()
	return createRestrictionViaService(body)
}
