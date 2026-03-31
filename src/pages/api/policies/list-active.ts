import type { APIRoute } from "astro"
import { db, eq, Policy, PolicyGroup } from "astro:db"
import { requireProvider } from "@/lib/auth/requireProvider"

// Minimal provider-only endpoint for CAPA 6 UX validation.
// Lists active policies with their categories for selection/assignment.
export const GET: APIRoute = async ({ request }) => {
	await requireProvider(request)

	const rows = await db
		.select({
			id: Policy.id,
			groupId: Policy.groupId,
			category: PolicyGroup.category,
			description: Policy.description,
			version: Policy.version,
			status: Policy.status,
		})
		.from(Policy)
		.innerJoin(PolicyGroup, eq(Policy.groupId, PolicyGroup.id))
		.where(eq(Policy.status, "active"))

	return new Response(JSON.stringify(rows), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	})
}
