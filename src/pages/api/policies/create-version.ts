import type { APIRoute } from "astro"
import { createPolicyVersionUseCase } from "@/container"

type CreateVersionBody = {
	previousPolicyId: string
	description?: string
	cancellationTiers?: {
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}[]
}

export const POST: APIRoute = async ({ request }) => {
	const { previousPolicyId, description, cancellationTiers } =
		(await request.json()) as CreateVersionBody

	if (!previousPolicyId) {
		return new Response("Missing previousPolicyId", { status: 400 })
	}

	try {
		const res = await createPolicyVersionUseCase({
			previousPolicyId,
			description,
			cancellationTiers,
		})
		return new Response(JSON.stringify(res), {
			headers: { "Content-Type": "application/json" },
		})
	} catch (err: any) {
		if (String(err?.message || err) === "Policy not found")
			return new Response("Policy not found", { status: 404 })
		throw err
	}
}
