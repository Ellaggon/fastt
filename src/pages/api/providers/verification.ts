import type { APIRoute } from "astro"
import { db, desc, eq, ProviderVerification } from "astro:db"
import { getProviderIdFromRequest } from "@/lib/auth/getProviderIdFromRequest"

export const GET: APIRoute = async ({ request }) => {
	const providerId = await getProviderIdFromRequest(request)
	if (!providerId) {
		return new Response(JSON.stringify({ error: "Provider not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	const latest =
		(await db
			.select({
				status: ProviderVerification.status,
				reason: ProviderVerification.reason,
				updatedAt: ProviderVerification.createdAt,
			})
			.from(ProviderVerification)
			.where(eq(ProviderVerification.providerId, providerId))
			.orderBy(desc(ProviderVerification.createdAt), desc(ProviderVerification.id))
			.get()) ?? null

	return new Response(
		JSON.stringify({
			status: latest?.status ?? "pending",
			reason: latest?.reason ?? null,
			updatedAt: latest?.updatedAt ?? null,
		}),
		{
			status: 200,
			headers: { "Content-Type": "application/json" },
		}
	)
}

export const handleProviderVerificationPost: APIRoute = async ({ request }) => {
	void request
	return new Response("Forbidden", { status: 403 })
}

export const POST: APIRoute = handleProviderVerificationPost
