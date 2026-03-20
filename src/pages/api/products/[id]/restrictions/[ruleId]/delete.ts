import type { APIRoute } from "astro"
import { catalogRestrictionRepository } from "@/container"
import { deleteRestriction } from "@/modules/catalog/public"

export const DELETE: APIRoute = async ({ params }) => {
	return deleteRestriction({ repo: catalogRestrictionRepository }, params.ruleId || "")
}
