import type { APIRoute } from "astro"
import { listAssignedPoliciesUseCase } from "@/container"

export const GET: APIRoute = async ({ url }) => {
	const scopeId = url.searchParams.get("scopeId")
	const category = url.searchParams.get("category")

	if (!scopeId) {
		return new Response("Missing scopeId", { status: 400 })
	}

	const policies = await listAssignedPoliciesUseCase(scopeId, category)

	return new Response(JSON.stringify(policies), {
		headers: { "Content-Type": "application/json" },
	})
}
