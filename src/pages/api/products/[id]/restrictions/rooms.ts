import type { APIRoute } from "astro"
import { catalogRestrictionRepository } from "@/container"
import { getRestrictionRooms } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ params }) => {
	return getRestrictionRooms({ repo: catalogRestrictionRepository }, String(params.id || ""))
}
