import type { APIRoute } from "astro"
import { ratePlanCommandRepository } from "@/container"
import { createRatePlan } from "@/modules/pricing/application/use-cases/create-rateplan"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const result = await createRatePlan({ repo: ratePlanCommandRepository }, body)

	if (!result.ok) {
		return new Response(JSON.stringify({ error: result.error }), { status: result.status })
	}

	return new Response(JSON.stringify({ ratePlanId: result.ratePlanId }), { status: 201 })
}
