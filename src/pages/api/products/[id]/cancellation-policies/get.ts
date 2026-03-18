import type { APIRoute } from "astro"
import { getCancellationPolicies } from "@/modules/catalog/application/use-cases/get-cancellation-policies"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id
	return getCancellationPolicies(productId || "")
}
