import type { APIRoute } from "astro"
import { getTaxes } from "@/modules/catalog/application/use-cases/get-taxes"

export const GET: APIRoute = async ({ params }) => {
	return getTaxes(params.id || "")
}
