import type { APIRoute } from "astro"
import { taxFeeRepository } from "@/container"
import { getTaxes } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ params }) => {
	return getTaxes({ repo: taxFeeRepository }, params.id || "")
}
