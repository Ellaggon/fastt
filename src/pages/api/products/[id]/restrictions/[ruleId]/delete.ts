import type { APIRoute } from "astro"
import { deleteRestriction } from "@/modules/catalog/application/use-cases/delete-restriction"

export const DELETE: APIRoute = async ({ params }) => {
	return deleteRestriction(params.ruleId || "")
}
