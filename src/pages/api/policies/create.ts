import type { APIRoute } from "astro"
import { z } from "zod"
import { requireProvider } from "@/lib/auth/requireProvider"
import {
	ensurePolicyOwnedByProvider,
	ensurePolicyScopeOwnedByProvider,
} from "@/lib/policies/policyOwnership"
import {
	assignPolicyCapa6,
	createPolicyCapa6,
	PolicyValidationError,
} from "@/modules/policies/public"

export const POST: APIRoute = async ({ request }) => {
	const { providerId } = await requireProvider(request)
	const body = await request.json()

	const {
		previousPolicyId,
		description,
		scope,
		scopeId,
		category,
		cancellationTiers,
		rules,
		status,
		policyPresetKey,
		stayLengthType,
		gracePeriod,
		refundBasis,
		payoutBasis,
		localTimezone,
		legalOverrideFlags,
	} = body

	if (!scope || !scopeId || !category) {
		return new Response("Missing fields", { status: 400 })
	}
	const scopeOwned = await ensurePolicyScopeOwnedByProvider({
		providerId,
		scope: String(scope),
		scopeId: String(scopeId),
	})
	if (!scopeOwned) {
		return new Response(JSON.stringify({ error: "Not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json" },
		})
	}
	if (previousPolicyId) {
		const policyOwned = await ensurePolicyOwnedByProvider({
			providerId,
			policyId: String(previousPolicyId),
		})
		if (!policyOwned) {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			})
		}
	}

	try {
		// CAPA 6 write path: create the (active) policy version, then assign it to the requested scope.
		const created = await createPolicyCapa6({
			previousPolicyId,
			ownerProviderId: providerId,
			category,
			description,
			rules,
			cancellationTiers,
			status: status ?? "active",
			policyPresetKey,
			stayLengthType,
			gracePeriod,
			refundBasis,
			payoutBasis,
			localTimezone,
			legalOverrideFlags,
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
