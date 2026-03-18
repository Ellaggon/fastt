import type { APIRoute } from "astro"
import { db, eq, Policy, CancellationTier } from "astro:db"

export const GET: APIRoute = async ({ params }) => {
	const { id } = params

	if (!id) {
		return new Response("Missing policy id", { status: 400 })
	}

	const policy = await db.select().from(Policy).where(eq(Policy.id, id)).get()

	if (!policy) {
		return new Response("Policy not found", { status: 404 })
	}

	const tiers = await db.select().from(CancellationTier).where(eq(CancellationTier.policyId, id))

	return new Response(
		JSON.stringify({
			...policy,
			cancellationTiers: tiers,
		}),
		{
			headers: { "Content-Type": "application/json" },
		}
	)
}
