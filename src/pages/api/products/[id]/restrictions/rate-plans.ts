import type { APIRoute } from "astro"
import { catalogRestrictionRepository } from "@/container"
import { getRestrictionRatePlans } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ params }) => {
	return getRestrictionRatePlans({ repo: catalogRestrictionRepository }, String(params.id || ""))
}
