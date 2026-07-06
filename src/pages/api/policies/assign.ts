import type { APIRoute } from "astro"
import { replacePolicyAssignmentCapa6UseCase } from "@/container/policies-write.container"
import { requireProvider } from "@/lib/auth/requireProvider"
import { getOrCreateProviderPresetPolicy } from "@/lib/policies/getOrCreateProviderPresetPolicy"
import {
	ensurePolicyOwnedByProvider,
	ensurePolicyScopeOwnedByProvider,
} from "@/lib/policies/policyOwnership"
import type { PolicyCategory } from "@/modules/policies/public"

const validCategories = new Set(["Cancellation", "Payment", "CheckIn", "NoShow"])
const validScopes = new Set(["product", "variant", "rate_plan"])

function text(value: unknown) {
	return String(value ?? "").trim()
}

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

export const POST: APIRoute = async ({ request }) => {
	const { providerId, user } = await requireProvider(request)
	const actorUserId = String(user?.id ?? "").trim() || undefined
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
	if (!body) return json(400, { error: "invalid_json" })

	const mode = text(body.mode)
	const scope = text(body.scope)
	const scopeId = text(body.scopeId)
	const channel = text(body.channel) || null

	if (!validScopes.has(scope) || !scopeId) {
		return json(400, { error: "invalid_scope" })
	}

	const scopeOwned = await ensurePolicyScopeOwnedByProvider({ providerId, scope, scopeId })
	if (!scopeOwned) {
		return json(403, { error: "scope_not_owned" })
	}

	let policyId = text(body.policyId)
	let category = text(body.category) as PolicyCategory

	if (mode === "existing") {
		if (!policyId) return json(400, { error: "missing_policy" })
		const policyOwned = await ensurePolicyOwnedByProvider({ providerId, policyId })
		if (!policyOwned) return json(403, { error: "policy_not_owned" })
	} else if (mode === "preset") {
		const policyPresetKey = text(body.policyPresetKey)
		if (!validCategories.has(category) || !policyPresetKey) {
			return json(400, { error: "invalid_preset_context" })
		}

		const presetPolicy = await getOrCreateProviderPresetPolicy({
			providerId,
			actorUserId,
			category,
			policyPresetKey,
		})
		policyId = presetPolicy.policyId
	} else {
		return json(400, { error: "invalid_mode" })
	}

	const result = await replacePolicyAssignmentCapa6UseCase({
		policyId,
		scope: scope as "product" | "variant" | "rate_plan",
		scopeId,
		channel,
		actorUserId,
	})

	return json(200, {
		success: true,
		policyId,
		assignmentId: result.assignmentId,
		replaced: result.replaced,
	})
}
