import type { APIRoute } from "astro"
import { cancellationPolicyRepository } from "@/container"
import { updateCancellationPolicy } from "@/modules/catalog/public"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, name, tiers } = await request.json()
	return updateCancellationPolicy({ repo: cancellationPolicyRepository, groupId, name, tiers })
}
