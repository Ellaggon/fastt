import type { APIRoute } from "astro"
import { updateCancellationPolicy } from "@/modules/catalog/application/use-cases/update-cancellation-policy"

export const POST: APIRoute = async ({ request }) => {
	const { groupId, name, tiers } = await request.json()
	return updateCancellationPolicy({ groupId, name, tiers })
}
