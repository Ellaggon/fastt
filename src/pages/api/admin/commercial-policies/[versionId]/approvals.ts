import type { APIRoute } from "astro"
import { z } from "zod"

import { requireInternalPermission } from "@/lib/auth/internal-authorization"
import { requireRecentInternalAuthentication } from "@/lib/auth/internal-step-up"
import {
	CommercialPolicyRatificationError,
	ratifyCommercialTourPolicy,
} from "@/lib/commercial-policy/ratification"

const schema = z.object({
	approvalArea: z.enum(["policy", "finance", "tour_operations"]),
	approvalReference: z.string().trim().min(8).max(500),
})

const permissionByApprovalArea = {
	policy: "commercial_policy.policy.approve",
	finance: "commercial_policy.finance.approve",
	tour_operations: "commercial_policy.tour_operations.approve",
} as const

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

/**
 * Records one named approval. The final required signature publishes the
 * already-complete version atomically; this endpoint never manufactures a
 * signature or a legal source from the selected vertical.
 */
export const POST: APIRoute = async ({ request, params }) => {
	const body = schema.safeParse(await request.json().catch(() => null))
	if (!body.success) return json({ error: "validation_error", details: body.error.flatten() }, 400)
	let principal: Awaited<ReturnType<typeof requireInternalPermission>>
	try {
		principal = await requireInternalPermission(
			request,
			permissionByApprovalArea[body.data.approvalArea]
		)
		await requireRecentInternalAuthentication({ request, user: principal.user })
	} catch (error) {
		if (error instanceof Response) return error
		throw error
	}
	const policyVersionId = String(params.versionId ?? "").trim()
	if (!policyVersionId) return json({ error: "policy_version_required" }, 400)
	try {
		const result = await ratifyCommercialTourPolicy({
			policyVersionId,
			approvalArea: body.data.approvalArea,
			approvalReference: body.data.approvalReference,
			approverUserId: principal.user.id,
		})
		return json(result, result.status === "published" ? 201 : 202)
	} catch (error) {
		if (error instanceof CommercialPolicyRatificationError) {
			const status =
				error.code === "commercial_policy_not_found"
					? 404
					: error.code === "commercial_policy_not_publishable"
						? 422
						: 409
			return json({ error: error.code, ...error.details }, status)
		}
		throw error
	}
}
