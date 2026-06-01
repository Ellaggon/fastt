import type { APIRoute } from "astro"
import { z } from "zod"
import { changePolicyLibraryStatusCapa6UseCase } from "@/container/policies-write.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { ensurePolicyOwnedByProvider } from "@/lib/policies/policyOwnership"
import { PolicyValidationError } from "@/modules/policies/public"

export const POST: APIRoute = async ({ params, request }) => {
	const { user, providerId } = await requireProvider(request)
	const policyId = String(params.id ?? "").trim()
	if (!policyId) return new Response("Missing policyId", { status: 400 })

	const owned = await ensurePolicyOwnedByProvider({ providerId, policyId })
	if (!owned) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}

	try {
		const result = await changePolicyLibraryStatusCapa6UseCase({
			policyId,
			status: "archived",
			actorUserId: user.id,
		})
		return Response.json({ success: true, ...result })
	} catch (err: any) {
		if (err instanceof z.ZodError) {
			return Response.json({ error: "validation_error", details: err.issues }, { status: 400 })
		}
		if (err instanceof PolicyValidationError) {
			return Response.json({ error: "validation_error", details: err.issues }, { status: 400 })
		}
		throw err
	}
}
