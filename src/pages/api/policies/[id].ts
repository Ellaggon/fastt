import type { APIRoute } from "astro"
import { getPolicyUseCase } from "@/container"

export const GET: APIRoute = async ({ params }) => {
	const { id } = params

	if (!id) {
		return new Response("Missing policy id", { status: 400 })
	}

	const policy = await getPolicyUseCase(id)

	if (!policy) {
		return new Response("Policy not found", { status: 404 })
	}

	return new Response(
		JSON.stringify({
			...policy,
		}),
		{
			headers: { "Content-Type": "application/json" },
		}
	)
}
