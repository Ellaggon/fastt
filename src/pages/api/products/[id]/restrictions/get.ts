import type { APIRoute } from "astro"
import { getRestrictions } from "@/modules/catalog/application/use-cases/get-restrictions"

export const GET: APIRoute = async ({ params }) => {
	return getRestrictions(params.id || "")
}
