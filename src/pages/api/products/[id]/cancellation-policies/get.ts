import type { APIRoute } from "astro"
import { cancellationPolicyRepository } from "@/container"
import { getCancellationPolicies } from "@/modules/catalog/public"

export const GET: APIRoute = async ({ params }) => {
	const productId = params.id
	return getCancellationPolicies({ repo: cancellationPolicyRepository }, productId || "")
}
