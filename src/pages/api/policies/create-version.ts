import type { APIRoute } from "astro"
import { z } from "zod"
import { createPolicyVersionCapa6UseCase } from "@/container/policies-write.container"
import { PolicyValidationError } from "@/modules/policies/application/errors/policyValidationError"
import { requireProvider } from "@/lib/auth/requireProvider"

type CreateVersionBody = {
	previousPolicyId: string
	description?: string
	rules?: Record<string, unknown>
	cancellationTiers?: {
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}[]
}

export const POST: APIRoute = async ({ request }) => {
	const { user } = await requireProvider(request)
	const { previousPolicyId, description, rules, cancellationTiers } =
		(await request.json()) as CreateVersionBody

	if (!previousPolicyId) {
		return new Response("Missing previousPolicyId", { status: 400 })
	}

	try {
		// CAPA 6 versioning: create a new active version within the existing group (assignment remains unchanged).
		const res = await createPolicyVersionCapa6UseCase({
			previousPolicyId,
			description: description ?? "",
			rules,
			cancellationTiers,
			actorUserId: user.id,
		})
		return new Response(
			JSON.stringify({
				success: true,
				id: res.policyId,
				groupId: res.groupId,
				version: res.version,
			}),
			{
				headers: { "Content-Type": "application/json" },
			}
		)
	} catch (err: any) {
		if (err instanceof z.ZodError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		if (err instanceof PolicyValidationError) {
			return new Response(JSON.stringify({ error: "validation_error", details: err.issues }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})
		}
		throw err
	}
}
