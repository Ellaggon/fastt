import type { APIRoute } from "astro"
import { getRestrictionRatePlans } from "@/modules/catalog/application/use-cases/get-restriction-rate-plans"

export const GET: APIRoute = async ({ params }) => {
	return getRestrictionRatePlans(String(params.id || ""))
}
