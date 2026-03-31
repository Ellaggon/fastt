import type { APIRoute } from "astro"
import { catalogRestrictionRepository } from "@/container"
import { getRestrictions } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ params }) => {
	return getRestrictions({ repo: catalogRestrictionRepository }, params.id || "")
}
