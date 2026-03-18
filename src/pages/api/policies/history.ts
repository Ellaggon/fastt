import type { APIRoute } from "astro"
import { db, Policy, eq } from "astro:db"

export const GET: APIRoute = async ({ url }) => {
	const groupId = url.searchParams.get("groupId")

	if (!groupId) {
		return new Response("Missing groupId", { status: 400 })
	}

	const rows = await db
		.select()
		.from(Policy)
		.where(eq(Policy.groupId, groupId))

	return new Response(JSON.stringify(rows))
}