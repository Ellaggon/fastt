import type { APIRoute } from "astro"
import { z } from "zod"
import {
	assignPolicyCapa6,
	createPolicyCapa6,
	PolicyValidationError,
} from "@/modules/policies/public"

export const POST: APIRoute = async ({ request }) => {
	const body = await request.json()

	const { previousPolicyId, description, scope, scopeId, category, cancellationTiers, rules } = body

	if (!scope || !scopeId || !category) {
		return new Response("Missing fields", { status: 400 })
	}

	try {
		// CAPA 6 write path: create the (active) policy version, then assign it to the requested scope.
		const created = await createPolicyCapa6({
			previousPolicyId,
			category,
			description,
			rules,
			cancellationTiers,
		})

		await assignPolicyCapa6({
			policyId: created.policyId,
			scope,
			scopeId,
			channel: null,
		})

		// Preserve legacy response shape.
		return Response.json({ id: created.policyId, groupId: created.groupId })
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
		if (String(err?.message || err) === "Missing fields")
			return new Response("Missing fields", { status: 400 })
		throw err
	}
}
