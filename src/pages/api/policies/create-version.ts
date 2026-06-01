import type { APIRoute } from "astro"
import { z } from "zod"
import { createPolicyVersionCapa6UseCase } from "@/container/policies-write.container"
import { PolicyValidationError } from "@/modules/policies/public"
import { requireProvider } from "@/lib/auth/requireProvider"
import { ensurePolicyOwnedByProvider } from "@/lib/policies/policyOwnership"

type CreateVersionBody = {
	previousPolicyId: string
	description?: string
	status?: "draft" | "template" | "active" | "archived"
	policyPresetKey?: string
	stayLengthType?: "any" | "short_stay" | "long_stay" | "monthly"
	gracePeriod?: number
	refundBasis?:
		| "total_booking"
		| "room_rate"
		| "first_night"
		| "deposit"
		| "provider_policy"
		| "none"
	payoutBasis?: "gross" | "net" | "collected" | "provider_policy"
	localTimezone?: string
	legalOverrideFlags?: Record<string, boolean>
	rules?: Record<string, unknown>
	cancellationTiers?: {
		daysBeforeArrival: number
		penaltyType: "percentage" | "nights"
		penaltyAmount: number
	}[]
}

export const POST: APIRoute = async ({ request }) => {
	const { user, providerId } = await requireProvider(request)
	const {
		previousPolicyId,
		description,
		status,
		policyPresetKey,
		stayLengthType,
		gracePeriod,
		refundBasis,
		payoutBasis,
		localTimezone,
		legalOverrideFlags,
		rules,
		cancellationTiers,
	} = (await request.json()) as CreateVersionBody

	if (!previousPolicyId) {
		return new Response("Missing previousPolicyId", { status: 400 })
	}
	const policyOwned = await ensurePolicyOwnedByProvider({ providerId, policyId: previousPolicyId })
	if (!policyOwned) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	try {
		// CAPA 6 versioning: create a new active version within the existing group (assignment remains unchanged).
		const res = await createPolicyVersionCapa6UseCase({
			previousPolicyId,
			description: description ?? "",
			status: status ?? "active",
			policyPresetKey,
			stayLengthType,
			gracePeriod,
			refundBasis,
			payoutBasis,
			localTimezone,
			legalOverrideFlags,
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
